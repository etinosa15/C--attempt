import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { openStore } from "./member-store.mjs";
import { freshState, sanitizeState, escapeHtml } from "./public/core.js";
import { lessons } from "./public/curriculum.js";

const scrypt = promisify(scryptCallback);
const digest = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const ttl = 7 * 86400000;
const lessonIds = new Set(lessons.map(lesson => lesson.id));
export const failure = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
export async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString("hex")}`;
}
async function passwordMatches(password, stored) {
  const actual = await passwordHash(password, stored.split(":")[0]);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) throw failure(400, "Use a password between 12 and 128 characters.");
  return value;
}
function emailAddress(value) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw failure(400, "Enter a valid email address.");
  return value.trim().toLowerCase();
}
export function cleanProfile(input = {}) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 80) throw failure(400, "Use a name between 2 and 80 characters.");
  const result = { name };
  for (const [key, values] of Object.entries({ experience: ["new", "some", "experienced"], focus: ["both", "js", "cs"], goal: ["career", "projects", "foundations"], minutes: [15, 30, 60, 90] })) {
    if (input[key] !== undefined) {
      if (!values.includes(input[key])) throw failure(400, "Choose one of the learning preferences shown.");
      result[key] = input[key];
    }
  }
  if (input.onboarded === true) {
    if (!result.experience || !result.focus || !result.goal || !result.minutes) throw failure(400, "Complete your learning preferences first.");
    result.onboarded = true;
  }
  return result;
}
export function cleanProgress(value) {
  let state;
  try { state = sanitizeState(value); } catch { throw failure(400, "This progress file is not valid."); }
  state.completed = state.completed.filter(id => lessonIds.has(id));
  state.solved = state.solved.filter(id => lessonIds.has(id));
  state.quizzes = Object.fromEntries(Object.entries(state.quizzes).filter(([id]) => lessonIds.has(id)));
  if (JSON.stringify(state).length > 2_000_000) throw failure(413, "Progress is too large. Export a backup and shorten large code drafts.");
  return state;
}

export async function createMembership(config, { fetchImpl = fetch } = {}) {
  const { dataDir, production, origin, env } = config;
  const store = await openStore(dataDir);
  const emailEnabled = Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
  const dummy = await passwordHash(secret());
  const rates = new Map();
  let hashing = 0;
  function rate(key, max = 10, period = 600000) {
    const now = Date.now();
    if (rates.size > 5000) for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    const row = rates.get(key);
    if (row && row.until > now) { if (++row.count > max) throw failure(429, "Too many attempts. Please try again later."); }
    else { if (rates.size > 10000) throw failure(429, "Please try again later."); rates.set(key, { count: 1, until: now + period }); }
  }
  async function withHash(action) {
    if (hashing >= 4) throw failure(429, "The sign-in service is busy. Try again in a moment.");
    hashing++;
    try { return await action(); } finally { hashing--; }
  }
  function cookieToken(req) { return req.headers.cookie?.split(/;\s*/).find(x => x.startsWith("forge_session="))?.slice(14) || ""; }
  function current(req) {
    const raw = cookieToken(req);
    if (!/^[a-f0-9]{64}$/.test(raw)) return null;
    const data = store.read(), session = data.sessions[digest(raw)];
    return session && session.expires > Date.now() ? data.users[session.userId] || null : null;
  }
  function requireUser(req) {
    const user = current(req);
    if (!user) throw failure(401, "Sign in to continue.");
    return user;
  }
  const entitlement = user => Boolean(user?.membership?.paidUntil > Date.now() && user.membership.mode === (env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"));
  const publicUser = user => user ? { id: user.id, email: user.email, verified: user.verified, profile: user.profile, createdAt: user.createdAt,
    premium: entitlement(user), membership: user.membership ? { billing: user.membership.billing, paidUntil: user.membership.paidUntil, cancelAtPeriodEnd: !!user.membership.cancelAtPeriodEnd, mode: user.membership.mode } : null } : null;
  function cookie(res, raw, clear = false) {
    res.setHeader("Set-Cookie", `forge_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : ttl / 1000}${production ? "; Secure" : ""}`);
  }
  async function session(req, res, id, expectedPassword) {
    const raw = secret();
    await store.transaction(data => {
      if (expectedPassword && data.users[id]?.password !== expectedPassword) throw failure(401, "Your password changed. Sign in again.");
      const now = Date.now();
      for (const [key, s] of Object.entries(data.sessions)) if (s.expires <= now) delete data.sessions[key];
      delete data.sessions[digest(cookieToken(req))];
      data.sessions[digest(raw)] = { userId: id, expires: now + ttl };
      const own = Object.entries(data.sessions).filter(([, s]) => s.userId === id).sort((a, b) => a[1].expires - b[1].expires);
      for (const [key] of own.slice(0, Math.max(0, own.length - 10))) delete data.sessions[key];
    });
    cookie(res, raw);
  }
  async function sendLink(user, kind) {
    if (production && !emailEnabled) throw failure(503, "Account email delivery is not connected yet. Contact support.");
    const raw = secret();
    await store.transaction(data => {
      for (const [key, row] of Object.entries(data.tokens)) if (row.expires < Date.now() || (row.userId === user.id && row.kind === kind)) delete data.tokens[key];
      data.tokens[digest(raw)] = { userId: user.id, kind, expires: Date.now() + (kind === "reset" ? 1800000 : 86400000) };
    });
    const link = `${origin}/#${kind === "reset" ? "reset-password" : "verify-email"}?token=${raw}`;
    if (!emailEnabled) {
      // Development mail never reaches an unauthenticated API response or the public folder.
      await appendFile(path.join(dataDir, "development-mail.jsonl"), JSON.stringify({ to: user.email, kind, link, createdAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
      return;
    }
    try {
      const response = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [user.email], subject: kind === "reset" ? "Reset your Forge password" : "Verify your Forge email", html: `<p>${kind === "reset" ? "A password reset was requested for your Forge account." : "Confirm your email to finish setting up Forge."}</p><p><a href="${escapeHtml(link)}">${kind === "reset" ? "Choose a new password" : "Verify email"}</a></p><p>If you did not request this, you can ignore this email.</p>` }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("delivery");
    } catch { throw failure(503, "Email delivery could not be confirmed. Try requesting a new link later."); }
  }
  async function handle(req, res, url, context) {
    if (!/^\/api\/(auth|account|progress)(\/|$)/.test(url.pathname)) return false;
    const { json, readBody, guard } = context;
    try {
      const name = url.pathname;
      if (req.method === "GET" && name === "/api/auth/session") {
        json(200, { user: publicUser(current(req)), emailEnabled, developmentMail: !production && !emailEnabled }); return true;
      }
      if (req.method === "GET" && name === "/api/progress") {
        const user = requireUser(req);
        json(200, { userId: user.id, state: user.progress, revision: user.revision, updatedAt: user.progressUpdatedAt || null }); return true;
      }
      guard();
      const input = await readBody();
      if (req.method === "POST" && ["/api/auth/register", "/api/auth/login"].includes(name)) {
        rate(`auth:${req.socket.remoteAddress}`, 25);
        const email = emailAddress(input.email), password = validatePassword(input.password);
        rate(`email:${email}`, 12);
        if (name.endsWith("register")) {
          if (input.acceptTerms !== true) throw failure(400, "Please read and accept the terms and privacy notice.");
          if (production && !emailEnabled) throw failure(503, "Registration will open when account email delivery is connected.");
          const profile = cleanProfile({ name: input.name });
          const hashed = await withHash(() => passwordHash(password));
          const user = await store.transaction(data => {
            if (Object.values(data.users).some(u => u.email === email)) throw failure(409, "This email cannot be registered. Try signing in or resetting your password.");
            const id = randomUUID();
            return data.users[id] = { id, email, password: hashed, profile, verified: false, createdAt: new Date().toISOString(), acceptedTerms: "2026-09-12", progress: freshState(), revision: 0 };
          });
          await session(req, res, user.id);
          let emailNotice = emailEnabled ? "Check your inbox to verify your email." : "Account created. Email delivery is awaiting setup; the verification link is in the local development mailbox.";
          try { await sendLink(user, "verify"); } catch (err) { emailNotice = err.message; }
          json(201, { user: publicUser(user), emailNotice }); return true;
        }
        const user = Object.values(store.read().users).find(u => u.email === email);
        const match = await withHash(() => passwordMatches(password, user?.password || dummy));
        if (!user || !match) throw failure(401, "Email or password is incorrect.");
        await session(req, res, user.id, user.password);
        json(200, { user: publicUser(user) }); return true;
      }
      if (name === "/api/auth/logout" && req.method === "POST") {
        await store.transaction(data => { delete data.sessions[digest(cookieToken(req))]; });
        cookie(res, "", true); json(200, { success: true }); return true;
      }
      if (name === "/api/auth/forgot-password" && req.method === "POST") {
        rate(`reset:${req.socket.remoteAddress}`, 5);
        const email = emailAddress(input.email);
        rate(`reset-email:${email}`, 3);
        if (production && !emailEnabled) throw failure(503, "Password reset emails are not connected yet. Contact support.");
        const user = Object.values(store.read().users).find(u => u.email === email);
        if (user) { try { await sendLink(user, "reset"); } catch { /* Keep account existence private. */ } }
        json(200, { message: "If that email belongs to an account, a reset link has been requested." }); return true;
      }
      if (name === "/api/auth/resend-verification" && req.method === "POST") {
        const user = requireUser(req); rate(`verify:${user.id}`, 3);
        if (!user.verified) await sendLink(user, "verify");
        json(200, { success: true }); return true;
      }
      if (["/api/auth/reset-password", "/api/auth/verify-email"].includes(name) && req.method === "POST") {
        rate(`token:${req.socket.remoteAddress}`, 20);
        const kind = name.endsWith("reset-password") ? "reset" : "verify";
        if (!/^[a-f0-9]{64}$/.test(input.token || "")) throw failure(400, "This link is invalid or expired. Request a new one.");
        const key = digest(input.token), initial = store.read().tokens[key];
        if (!initial || initial.kind !== kind || initial.expires <= Date.now()) throw failure(400, "This link is invalid or expired. Request a new one.");
        const hashed = kind === "reset" ? await withHash(() => passwordHash(validatePassword(input.password))) : null;
        await store.transaction(data => {
          const row = data.tokens[key];
          if (!row || row.kind !== kind || row.expires <= Date.now()) throw failure(400, "This link is invalid or expired. Request a new one.");
          const user = data.users[row.userId];
          if (kind === "reset") {
            user.password = hashed;
            for (const [key, s] of Object.entries(data.sessions)) if (s.userId === user.id) delete data.sessions[key];
            for (const [key, t] of Object.entries(data.tokens)) if (t.userId === user.id && t.kind === "reset") delete data.tokens[key];
          } else user.verified = true;
          delete data.tokens[key];
        });
        if (kind === "reset") cookie(res, "", true);
        json(200, { success: true }); return true;
      }
      if (name === "/api/account/profile" && req.method === "PUT") {
        const user = requireUser(req), profile = cleanProfile(input);
        if (input.accountId !== user.id) throw failure(403, "Your signed-in account changed. Reload before saving.");
        await store.transaction(data => { data.users[user.id].profile = { ...data.users[user.id].profile, ...profile }; });
        json(200, { user: publicUser(store.read().users[user.id]) }); return true;
      }
      if (name === "/api/progress" && req.method === "PUT") {
        const user = requireUser(req), progress = cleanProgress(input.state);
        if (input.accountId !== user.id) throw failure(403, "Your signed-in account changed. Reload before syncing.");
        rate(`sync:${user.id}`, 180, 60000);
        const result = await store.transaction(data => {
          const row = data.users[user.id];
          if (!Number.isSafeInteger(input.revision) || input.revision !== row.revision) throw failure(409, "Progress changed on another device. Choose which copy to keep in Account.");
          row.progress = progress; row.revision++; row.progressUpdatedAt = new Date().toISOString();
          return { revision: row.revision, updatedAt: row.progressUpdatedAt };
        });
        json(200, result); return true;
      }
      throw failure(404, "Account endpoint not found.");
    } catch (error) { json(error.status || 500, { error: error.status ? error.message : "The account service could not complete this request." }); }
    return true;
  }
  return { store, current, requireUser, publicUser, entitlement, handle, rate, emailEnabled };
}

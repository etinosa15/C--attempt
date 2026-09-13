import { freshState, sanitizeState, STORAGE_KEY, escapeHtml as e } from "./core.js";
import { naira, planPrice } from "./plans.js";

let config, user = null, service = {}, revision = 0, dirty = false, syncState = "Guest · saved on this device", conflict = null;
let timer, inFlight = null, generation = 0, lastSaved = null;
const get = selector => document.querySelector(selector);
const cacheKey = id => `forge.account.${id}.v1`;
export const memberUser = () => user;
export const memberService = () => service;
export const memberSyncStatus = () => syncState;
export const hasPremium = () => Boolean(user?.premium && user.membership?.paidUntil > Date.now());
export const guestProfile = () => { try { return JSON.parse(localStorage.getItem("forge.learner-profile.v1")) || {}; } catch { return {}; } };
export const learnerProfile = () => user?.profile || guestProfile();

export async function memberApi(path, body, method = "POST") {
  if (!service.token) service = await fetch("/api/status").then(r => r.json());
  const response = await fetch(path, { method: body === undefined ? "GET" : method, headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Forge-Token": service.token },
    body: body === undefined ? undefined : JSON.stringify({ ...body, ...(user ? { accountId: user.id } : {}) }) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "This request could not be completed."), { status: response.status });
  return result;
}
function syncLabel(text) { syncState = text; document.querySelectorAll("[data-sync-status]").forEach(el => el.textContent = text); }
function writeCache() {
  try {
    if (user) localStorage.setItem(cacheKey(user.id), JSON.stringify({ state: config.getState(), revision, dirty, updatedAt: lastSaved }));
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(config.getState()));
    return true;
  } catch { syncLabel("Browser storage unavailable · export a backup"); return false; }
}
export function saveMemberProgress() {
  if (!config) return true;
  if (user) dirty = true;
  const saved = writeCache();
  if (user && !conflict) {
    syncLabel("Saved here · waiting to sync");
    clearTimeout(timer); timer = setTimeout(() => flushProgress(), 1000);
  }
  return saved;
}
export async function flushProgress() {
  if (!user || !dirty || conflict) return;
  if (inFlight) { await inFlight; if (dirty && !conflict) return flushProgress(); return; }
  const owner = user.id, started = generation, snapshot = JSON.stringify(config.getState());
  syncLabel("Syncing progress…");
  inFlight = (async () => {
    try {
      const result = await memberApi("/api/progress", { state: JSON.parse(snapshot), revision }, "PUT");
      if (generation !== started || user?.id !== owner) return;
      revision = result.revision; lastSaved = result.updatedAt;
      dirty = snapshot !== JSON.stringify(config.getState());
      writeCache(); syncLabel(dirty ? "Saved here · changes waiting" : "Progress synced to your account");
    } catch (error) {
      if (generation !== started) return;
      if (error.status === 409) {
        try { conflict = await memberApi("/api/progress"); if (conflict.userId !== owner) conflict = { unavailable: true }; } catch { conflict = { unavailable: true }; }
        syncLabel("Sync needs attention · open Account");
      } else syncLabel(error.status === 401 || error.status === 403 ? "Sign in again to sync · saved on this device" : "Offline · progress saved on this device");
    } finally { inFlight = null; }
  })();
  await inFlight;
}
async function adopt(account) {
  generation++; clearTimeout(timer); user = account; conflict = null; dirty = false; revision = 0;
  if (!account) {
    let guest = freshState();
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) guest = sanitizeState(JSON.parse(raw)); } catch { /* Recover with empty guest state. */ }
    config.setState(guest); syncLabel("Guest · saved on this device"); return;
  }
  let cached;
  try { cached = JSON.parse(localStorage.getItem(cacheKey(account.id))); if (cached) cached.state = sanitizeState(cached.state); } catch { cached = null; }
  try {
    const remote = await memberApi("/api/progress");
    if (remote.userId !== account.id) throw new Error("The signed-in account changed in another tab. Reload to continue.");
    revision = remote.revision; lastSaved = remote.updatedAt;
    if (cached?.dirty) {
      config.setState(cached.state); dirty = true;
      if (cached.revision !== remote.revision) { revision = cached.revision; conflict = remote; syncLabel("Sync needs attention · open Account"); }
      else { syncLabel("Saved here · waiting to sync"); timer = setTimeout(() => flushProgress(), 800); }
    } else { config.setState(sanitizeState(remote.state)); syncLabel("Progress synced to your account"); }
    writeCache();
  } catch {
    config.setState(cached?.state || freshState()); revision = cached?.revision || 0; dirty = Boolean(cached?.dirty); conflict = { unavailable: true };
    syncLabel("Account progress unavailable · reload before syncing");
  }
}
export async function initMember(options) {
  config = options;
  try {
    const [status, session] = await Promise.all([fetch("/api/status").then(r => r.json()), memberApi("/api/auth/session")]);
    service = { ...status, ...session }; await adopt(session.user);
  } catch { syncLabel("Guest · server unavailable"); }
  document.addEventListener("submit", submit);
  document.addEventListener("click", click);
  window.addEventListener("online", () => flushProgress());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushProgress(); });
  return service;
}
async function changed() { await config.onAccountChange?.(); config.refresh(); }
export async function saveLearnerProfile(profile) {
  if (user) { user = (await memberApi("/api/account/profile", profile, "PUT")).user; }
  else localStorage.setItem("forge.learner-profile.v1", JSON.stringify(profile));
  config.setGoal(profile.minutes); return profile;
}
export function accountPanel() {
  return `<section class="panel settings-panel"><div class="settings-icon">${config.icon("settings", 24)}</div><h2>${user ? `Hello, ${e(user.profile.name)}.` : "Your learning, together."}</h2><p>${user ? "Manage your profile, progress, and membership from one place." : "Create an account to keep your learning progress with you across devices on this Forge site."}</p><p class="sync-label" data-sync-status>${e(syncState)}</p><a class="button secondary" href="#account">${user ? "Manage account" : "Sign in or create account"} ${config.icon("arrow", 15)}</a></section>`;
}
export function attachMemberShell() {
  const profile = get(".profile");
  if (profile) profile.innerHTML = `<a href="#account" class="profile-account"><span class="avatar">${e((user?.profile.name || "G").slice(0, 1).toUpperCase())}</span><span><strong>${e(user?.profile.name || "Guest learner")}</strong><small data-sync-status>${e(syncState)}</small></span></a>`;
  const avatar = get(".top-avatar");
  if (avatar) avatar.outerHTML = `<a href="#account" class="top-avatar" aria-label="${user ? "Your account" : "Sign in"}">${e((user?.profile.name || "G").slice(0, 1).toUpperCase())}</a>`;
}
const field = (label, name, type = "text", autocomplete = "", extra = "") => `<label class="member-field">${label}<input name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}></label>`;
const notice = `<p class="member-message" id="member-message" role="status" aria-live="polite"></p>`;
export function renderAccount(main, route = "account") {
  const query = new URLSearchParams(location.hash.split("?")[1]);
  if (route === "verify-email" || route === "reset-password") {
    const reset = route === "reset-password";
    main.innerHTML = `<section class="account-card panel"><div class="eyebrow">YOUR FORGE ACCOUNT</div><h1>${reset ? "Choose a fresh password." : "One last check."}</h1><p>${reset ? "A strong passphrase can be easy to remember. Use at least 12 characters." : "Confirm your email address to enable subscriptions and online coding."}</p><form data-member-form="${route}"><input type="hidden" name="token" value="${e(query.get("token") || "")}">${reset ? field("New password", "password", "password", "new-password", 'minlength="12" maxlength="128"') : ""}<button class="button primary" type="submit">${reset ? "Save new password" : "Verify email"}</button>${notice}</form><a href="#account">Back to sign in</a></section>`;
    return;
  }
  if (route === "forgot-password") {
    main.innerHTML = `<section class="account-card panel"><div class="eyebrow">LET’S GET YOU BACK IN</div><h1>Forgot your password?</h1><p>Enter the email address you used for Forge. We’ll request a secure reset link.</p><form data-member-form="forgot-password">${field("Email address", "email", "email", "email", 'maxlength="254"')}<button class="button primary">Request reset link</button>${notice}</form><a href="#account">Back to sign in</a></section>`;
    return;
  }
  if (!user) {
    const register = route === "signup";
    main.innerHTML = `<div class="account-layout"><section class="account-intro"><div class="eyebrow">A PLACE TO KEEP GROWING</div><h1>${register ? "Make the next chapter yours." : "Welcome back, developer."}</h1><p>Keep your notes, challenges, and progress together. Pick up where you left off on any device connected to this Forge site.</p><div class="account-benefit">${config.icon("book")} Two languages. One learning space.</div><div class="account-benefit">${config.icon("check")} Your progress, safely saved.</div><div class="account-benefit">${config.icon("clock")} A study plan that fits your day.</div><a href="#overview">Continue as a guest →</a></section><section class="account-card panel"><h2>${register ? "Create your account" : "Sign in to Forge"}</h2><p>${register ? 'Already learning with us? <a href="#account">Sign in</a>' : 'New here? <a href="#signup">Create an account</a>'}</p><form data-member-form="${register ? "register" : "login"}">${register ? field("Your name", "name", "text", "name", 'minlength="2" maxlength="80"') : ""}${field("Email address", "email", "email", "email", 'maxlength="254"')}${field("Password", "password", "password", register ? "new-password" : "current-password", 'minlength="12" maxlength="128"')}<p class="field-help">At least 12 characters. A memorable passphrase works well.</p>${register ? '<label class="member-check"><input type="checkbox" name="acceptTerms" required><span>I agree to the <a href="#terms" target="_blank" rel="noopener">terms</a> and have read the <a href="#privacy" target="_blank" rel="noopener">privacy notice</a>.</span></label>' : '<a class="forgot-link" href="#forgot-password">Forgot password?</a>'}<button class="button primary" type="submit">${register ? "Create account" : "Sign in"} ${config.icon("arrow", 16)}</button>${notice}</form><p class="field-help">${service.publicDeployment ? "Your account is stored on this Forge service." : "This local account belongs to this running Forge server. Cross-device access becomes available when the site is hosted."}</p></section></div>`;
    return;
  }
  main.innerHTML = `<div class="page-heading"><div class="eyebrow">YOUR ACCOUNT</div><h1>A home for your progress.</h1><p>Keep your details, learning plan, and membership in order.</p></div><div class="account-dashboard"><section class="panel member-panel"><div class="member-heading"><span class="large-avatar">${e(user.profile.name.slice(0, 1).toUpperCase())}</span><div><h2>${e(user.profile.name)}</h2><p>${e(user.email)}</p></div></div><span class="account-status">${user.verified ? "Email verified" : "Email verification needed"}</span>${!user.verified ? '<p>Email verification enables subscriptions and online C#. ${service.emailEnabled ? "Check your inbox for the link." : "Email delivery is awaiting setup on this local instance."}</p><button class="text-button" data-member-action="resend-verification">Send another verification link</button>' : ""}<form data-member-form="profile">${field("Display name", "name", "text", "name", `value="${e(user.profile.name)}" minlength="2" maxlength="80"`)}<button class="button secondary">Save profile</button></form><a href="#onboarding" class="account-link">Update learning preferences →</a><button class="text-button" data-member-action="logout">Sign out of this device</button>${notice}</section><section class="panel member-panel"><div class="eyebrow">LEARNING PROGRESS</div><h2>Ready when you are.</h2><p class="sync-label" data-sync-status>${e(syncState)}</p><div class="account-progress"><strong>${config.getState().completed.length}<small>lessons completed</small></strong><strong>${config.getState().solved.length}<small>challenges solved</small></strong></div>${conflict ? conflict.unavailable ? '<p>We could not load your account progress. Your device copy is safe. Reload after the connection returns.</p><button class="button secondary" data-member-action="reload-account">Try loading account progress</button>' : `<div class="sync-conflict"><h3>Two copies need your attention.</h3><p>This device has ${config.getState().completed.length} completed lessons; your account has ${conflict.state.completed.length}. Export a backup before replacing either copy.</p><a href="#settings">Export a backup in Settings</a><button class="button secondary" data-member-action="use-remote">Use account copy</button><button class="button secondary" data-member-action="use-local">Replace account copy with this device</button></div>` : '<button class="button secondary" data-member-action="sync">Sync now</button>'}<p>Your guest progress is kept separately on this browser.</p><button class="text-button" data-member-action="import-guest">Copy guest progress into this account</button><a href="#settings" class="account-link">Export or import a backup →</a></section></div><section class="panel member-panel billing-panel"><div class="eyebrow">FORGE PREMIUM</div><h2>Your membership</h2><div id="billing-details"><p>Loading your membership…</p></div></section>`;
  loadBilling();
}
async function loadBilling() {
  const holder = get("#billing-details"); if (!holder) return;
  try {
    const data = await memberApi("/api/billing");
    if (!holder.isConnected) return;
    user = data.user;
    holder.innerHTML = `<div class="membership-summary"><div><strong>${hasPremium() ? `Premium · ${user.membership.billing}` : "Free / early access"}</strong><p>${hasPremium() ? `Access until ${new Date(user.membership.paidUntil).toLocaleDateString("en-NG", { dateStyle: "long" })}. ${user.membership.cancelAtPeriodEnd ? "Renewal is stopped." : "Renews automatically unless you cancel."}` : "Explore Premium for deeper practice and study insights."}</p>${user.membership?.mode === "test" ? '<p class="test-mode-note">Test subscription · no live payment</p>' : ""}</div><a class="button secondary" href="#premium">View plans</a></div>${hasPremium() && !user.membership.cancelAtPeriodEnd ? '<button class="text-button" data-member-action="cancel-renewal">Stop automatic renewal</button>' : ""}${!data.enabled ? '<p>Payments are not connected yet. Your account and saved progress still work.</p>' : data.mode === "test" ? '<p class="test-mode-note">Checkout is in test mode. Use only Paystack test payment details.</p>' : ""}<h3>Payment history</h3>${data.orders.length ? `<div class="payment-history">${data.orders.map(order => `<article><div><strong>${naira(order.amount / 100)} · ${order.billing}</strong><small>${new Date(order.createdAt).toLocaleDateString()} · ${e(order.mode)} · ${e(order.status)}</small><code>${e(order.reference)}</code></div>${order.status === "paid" ? `<button class="text-button" data-receipt="${e(order.reference)}">View receipt</button>` : `<button class="text-button" data-verify-payment="${e(order.reference)}">Check payment</button>`}</article>`).join("")}</div>` : '<p>No payments yet. Confirmed payments and receipts will appear here.</p>'}`;
    holder.dataset.orders = JSON.stringify(data.orders);
  } catch (error) { holder.textContent = error.message; }
}
function message(value, error = false) {
  const el = get("#member-message");
  if (el) { el.textContent = value; el.classList.toggle("is-error", error); }
  else config.toast(value);
}
async function submit(event) {
  const form = event.target.closest("[data-member-form]"); if (!form) return;
  event.preventDefault(); const action = form.dataset.memberForm;
  const values = Object.fromEntries(new FormData(form));
  const submitter = form.querySelector('button[type="submit"],button');
  if (submitter.disabled) return; submitter.disabled = true; message("");
  try {
    if (["register", "login"].includes(action)) {
      const result = await memberApi(`/api/auth/${action}`, { ...values, acceptTerms: values.acceptTerms === "on" });
      await adopt(result.user); await config.onAccountChange?.(); location.hash = result.user.profile.onboarded ? "account" : "onboarding";
      if (action === "register") config.toast(result.emailNotice || "Account created.");
      else config.toast("Welcome back. Your account progress is ready.");
    } else if (action === "profile") {
      user = (await memberApi("/api/account/profile", values, "PUT")).user; await changed(); message("Profile saved.");
    } else {
      await memberApi(`/api/auth/${action}`, values);
      if (action === "forgot-password") message(service.emailEnabled ? "If this email belongs to an account, a reset link has been requested." : "If the account exists, its reset link is in the local development mailbox. The site owner can view it with npm run mail:preview.");
      if (action === "reset-password") { await adopt(null); location.hash = "account"; config.toast("Password updated. Sign in with your new password."); }
      if (action === "verify-email") { const session = await memberApi("/api/auth/session"); user = session.user; location.hash = "account"; config.toast("Email verified. Thank you."); }
    }
  } catch (error) { message(error.message, true); }
  finally { submitter.disabled = false; }
}
async function click(event) {
  const button = event.target.closest("[data-member-action],[data-verify-payment],[data-receipt]"); if (!button) return;
  if (button.disabled) return; button.disabled = true;
  try {
    const action = button.dataset.memberAction;
    if (action === "logout") {
      await flushProgress();
      if (dirty && !confirm("Some progress has not synced. It is saved in this browser for your next sign-in. Sign out now?")) return;
      await memberApi("/api/auth/logout", {}); await adopt(null); await changed();
    }
    if (action === "resend-verification") { await memberApi("/api/auth/resend-verification", {}); message(service.emailEnabled ? "A new verification link has been requested." : "Verification link saved in the local development mailbox. The site owner can view it with npm run mail:preview."); }
    if (action === "sync") { await flushProgress(); renderAccount(get("#main")); }
    if (action === "reload-account") { await adopt(user); renderAccount(get("#main")); }
    if (action === "use-remote" && conflict?.state && confirm("Replace this device’s account progress with the account copy? Export first if you need both.")) { config.setState(sanitizeState(conflict.state)); revision = conflict.revision; conflict = null; dirty = false; writeCache(); syncLabel("Progress synced to your account"); config.refresh(); }
    if (action === "use-local" && conflict?.state && confirm("Replace the account copy with the progress on this device? Other devices will be asked to resolve their copies.")) { revision = conflict.revision; conflict = null; dirty = true; await flushProgress(); config.refresh(); }
    if (action === "import-guest") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("There is no guest progress on this browser.");
      if (!confirm("Replace this account’s progress with this browser’s guest progress? Export a backup first if you want both.")) return;
      config.setState(sanitizeState(JSON.parse(raw))); saveMemberProgress(); await flushProgress(); config.refresh();
    }
    if (action === "cancel-renewal" && confirm("Stop automatic renewal? Premium access continues until the end of the paid period.")) { user = (await memberApi("/api/billing/cancel", { confirm: true })).user; await loadBilling(); config.toast("Renewal stopped. Your remaining paid access is unchanged."); }
    if (button.dataset.verifyPayment) { user = (await memberApi("/api/billing/verify", { reference: button.dataset.verifyPayment })).user; await config.onAccountChange?.(); await loadBilling(); config.toast("Payment confirmed. Your plan is up to date."); }
    if (button.dataset.receipt) {
      const orders = JSON.parse(get("#billing-details").dataset.orders || "[]"), order = orders.find(o => o.reference === button.dataset.receipt);
      if (!order || order.status !== "paid") return;
      const dialog = document.createElement("dialog"); dialog.className = "receipt-dialog"; dialog.setAttribute("aria-label", "Payment receipt");
      dialog.innerHTML = `<div class="eyebrow">FORGE · PAYMENT RECEIPT</div><h2>${naira(order.amount / 100)}</h2><p>Premium ${order.billing} · ${order.mode === "test" ? "test payment" : "paid"}</p><dl><dt>Account</dt><dd>${e(user.email)}</dd><dt>Paid</dt><dd>${new Date(order.paidAt).toLocaleString()}</dd><dt>Reference</dt><dd><code>${e(order.reference)}</code></dd><dt>Processor</dt><dd>Paystack</dd></dl><p>This is a payment record, not a tax invoice.</p><form method="dialog"><button class="button secondary">Close receipt</button></form>`;
      document.body.append(dialog); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
    }
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
}
export function renderCheckout(main, billing = "monthly") {
  billing = billing === "yearly" ? "yearly" : "monthly";
  const price = planPrice(billing);
  main.innerHTML = `<section class="account-card checkout-card panel"><div class="eyebrow">FORGE PREMIUM</div><h1>Your next chapter.</h1><p>Both languages. The complete learning path.</p><div class="checkout-price">${naira(price.total)}<small> / ${billing === "yearly" ? "year" : "month"}</small></div>${billing === "yearly" ? `<p>Save ₦7,200 per year. ₦2,400/month equivalent, billed annually.</p>` : ""}<ul><li>All 40 lessons and coding challenges</li><li>All 6 project briefs and spaced review</li><li>Study insights and your daily routine</li></ul>${!user ? '<p>Sign in before starting a subscription.</p><a class="button primary" href="#account">Sign in to continue</a>' : !service.billingEnabled ? '<p>Checkout is not connected yet. No payment will be taken.</p><a class="button primary" href="#premium">Explore the plan preview</a>' : `<p>${service.billingMode === "test" ? '<strong class="test-mode-note">Test checkout · no live payments.</strong>' : "Payment details are entered securely on Paystack."}</p><form id="checkout-form"><label class="member-check"><input type="checkbox" required><span>I agree to ${naira(price.total)} every ${billing === "yearly" ? "year" : "month"} until cancelled and accept the <a href="#terms" target="_blank" rel="noopener">subscription terms</a>. I can stop renewal in Account.</span></label><button class="button primary" ${user.verified ? "" : "disabled"}>${service.billingMode === "test" ? "Continue to test checkout" : "Continue to Paystack"}</button>${user.verified ? "" : '<p><a href="#account">Verify your email in Account</a> before subscribing.</p>'}<p id="checkout-message" role="status"></p></form>`}<a class="account-link" href="#premium">← Back to plans</a></section>`;
  get("#checkout-form")?.addEventListener("submit", async event => {
    event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true;
    try { const result = await memberApi("/api/billing/checkout", { billing, acceptBilling: true }); location.assign(result.url); }
    catch (error) { get("#checkout-message").textContent = error.message; button.disabled = false; }
  });
}
export async function renderBillingReturn(main) {
  const reference = new URLSearchParams(location.search).get("reference") || new URLSearchParams(location.search).get("payment");
  main.innerHTML = `<section class="account-card panel"><div class="eyebrow">PAYMENT STATUS</div><h1>Checking your payment.</h1><p id="payment-return-message" role="status">Confirming the result with Paystack…</p><a class="button secondary" href="#account">Go to your account</a></section>`;
  try {
    if (!user) throw new Error("Sign in to the account used at checkout, then check the payment in your account history.");
    if (!reference) throw new Error("No payment reference was returned. You can check recent payments in Account.");
    user = (await memberApi("/api/billing/verify", { reference })).user; await config.onAccountChange?.();
    get("#payment-return-message").textContent = "Payment confirmed. Your Premium plan is ready.";
  } catch (error) { if (get("#payment-return-message")) get("#payment-return-message").textContent = error.message; }
}

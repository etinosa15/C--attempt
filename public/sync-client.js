// The browser half of accounts + cloud sync. Talks only to the sync service in
// sync-server.mjs; it never touches the local C# runner, which stays loopback.
//
// When `origin` is empty this module does nothing at all — no requests, no UI
// state, no storage writes — so an edition built without a sync service behaves
// exactly like the local-first app that came before accounts existed.
import {
  freshState,
  freshFocusTimer,
  sanitizeState,
  progressChanges,
  applyProgressChanges,
  adoptState,
  DEVICE_LOCAL,
  STORAGE_KEY,
} from "./core.js";

// The last state this device and the account agreed on. Kept in its own
// device-local key: a baseline stored inside the progress record would be
// exported with it, travel to another machine, and then describe an agreement
// that machine never made.
export const SYNC_KEY = STORAGE_KEY + ".sync";

const REQUEST_MS = 15000;
const DEBOUNCE_MS = 3000;
const BACKOFF_MS = 60000;
// Renew the in-memory access token this long before it expires, so a request in
// flight never races the ~1h expiry and drops the learner to local mode.
const EXPIRY_SKEW_MS = 60000;
// Browsers cap the body of a keepalive request; above this, send it normally
// and accept that a page closing mid-flight will sync on the next visit.
const KEEPALIVE_LIMIT = 60 * 1024;

const syncable = (change) => !DEVICE_LOCAL.includes(change.path[0]);

function problem(message, status = 0) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createSyncClient({
  origin = "",
  fetchImpl = (...args) => fetch(...args),
  storage = () => localStorage,
  // Supplied by the app: how to read the live progress state, how to write a
  // merged one back, and what to do before a first-contact merge.
  readState = () => freshState(),
  writeState = async () => {},
  onAdopt = async () => {},
  onAuth = () => {},
  onError = () => {},
  now = () => Date.now(),
  requestTimeoutMs = REQUEST_MS,
  debounceMs = DEBOUNCE_MS,
} = {}) {
  const enabled = Boolean(origin);
  let account = null;
  // Cookies carry the session. This is the fallback for browsers that refuse a
  // cross-site cookie outright, and it stays in memory on purpose: a bearer
  // token in localStorage is readable by any script that gets injected.
  let token = "";
  // The refresh token + access-token expiry ride along in memory too, on the same
  // reasoning — never persisted, so a reload still means a fresh sign-in, but a
  // session left open past an hour renews itself instead of silently signing out.
  let refreshToken = "";
  let expiresAt = 0;
  let refreshing = null;
  let timer = null;
  let pausedUntil = 0;
  let lastSynced = 0;
  let chain = Promise.resolve();

  function setAccount(next) {
    const before = account?.email || "";
    account = next;
    if (before !== (next?.email || "")) onAuth(account);
  }

  function readRecord() {
    try {
      const raw = storage().getItem(SYNC_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || typeof value.email !== "string") return null;
      return {
        email: value.email,
        baseline: sanitizeState(value.baseline),
        revision: Number.isInteger(value.revision) ? value.revision : 0,
        lastSynced: Number.isFinite(value.lastSynced) ? value.lastSynced : 0,
      };
    } catch {
      // A damaged or unreadable baseline is not a failure: the next sync simply
      // treats this device as new and merges instead of replaying deltas, which
      // cannot double-count. Losing the file is safe; trusting a bad one is not.
      return null;
    }
  }
  function writeRecord(record) {
    lastSynced = record.lastSynced;
    try { storage().setItem(SYNC_KEY, JSON.stringify(record)); }
    catch { /* Full storage costs a delta baseline, not correctness. */ }
  }

  async function request(path, { method = "GET", body, keepalive = false, auth = true } = {}) {
    // Renew a token that is about to expire before we spend it — but only when we
    // know the expiry and hold a refresh token. login/signup/refresh pass auth:false.
    if (auth && token && refreshToken && expiresAt && now() >= expiresAt - EXPIRY_SKEW_MS)
      await doRefresh();
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), requestTimeoutMs);
    const headers = { "X-Forge-Sync": "1" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetchImpl(origin + path, {
        method,
        headers,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
        ...(keepalive && body !== undefined && body.length <= KEEPALIVE_LIMIT ? { keepalive: true } : {}),
      });
    } catch {
      throw problem("Could not reach the sync service. Your progress is saved on this device and will sync when the connection returns.");
    } finally {
      clearTimeout(deadline);
    }
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (response.status === 401) {
      // The access token may just have expired since the pre-check. Try one refresh
      // and replay before giving up the session (auth:false so a dead refresh token
      // cannot loop). Only a genuine failure signs the learner out.
      if (auth && refreshToken && await doRefresh())
        return request(path, { method, body, keepalive, auth: false });
      token = "";
      refreshToken = "";
      expiresAt = 0;
      setAccount(null);
      throw problem("You are signed out. Your progress is still saved on this device.", 401);
    }
    if (response.status === 429) {
      pausedUntil = now() + BACKOFF_MS;
      throw problem(data?.error || "Too many attempts. Try again in a minute.", 429);
    }
    if (!response.ok)
      throw problem(data?.error || `The sync service returned HTTP ${response.status}.`, response.status);
    if (!data || typeof data !== "object")
      throw problem("The sync service returned an unreadable response.", response.status);
    return data;
  }

  // Send what this device changed since the agreed baseline, then fold the
  // authoritative reply back together with anything that changed while the
  // request was in flight — the same move progress-store makes between tabs.
  async function pushDelta(record, keepalive = false) {
    const before = sanitizeState(readState());
    const changes = progressChanges(record.baseline, before).filter(syncable);
    const data = changes.length
      ? await request("/api/sync", { method: "POST", body: JSON.stringify({ changes }), keepalive })
      : await request("/api/sync");
    const server = sanitizeState(data.state);
    writeRecord({ email: account.email, baseline: server, revision: data.revision, lastSynced: now() });
    const latest = sanitizeState(readState());
    const next = applyProgressChanges(server, progressChanges(before, latest));
    // The running timer belongs to this machine and is never sent, so the
    // account's copy of it is meaningless here.
    next.focusTimer = latest.focusTimer;
    await writeState(next, false);
    return next;
  }

  // No baseline for this account on this device: a new machine, or a return
  // after signing out. Deltas cannot be computed against an agreement that was
  // never made, so combine the two records instead.
  async function reconcile(server, revision) {
    const local = sanitizeState(readState());
    const record = readRecord();
    const continuing = record?.email === account.email;
    let next;
    if (continuing) {
      next = applyProgressChanges(server, progressChanges(record.baseline, local).filter(syncable));
    } else {
      // Keep a downloadable copy of exactly what this device held first, so a
      // merge the learner dislikes is always reversible.
      await onAdopt(local);
      next = adoptState(server, local);
    }
    next.focusTimer = local.focusTimer;
    writeRecord({ email: account.email, baseline: server, revision, lastSynced: now() });
    await writeState(next, !continuing);
    // The account does not have the merged result yet.
    return pushDelta({ email: account.email, baseline: server, revision, lastSynced: now() });
  }

  async function syncNow(keepalive = false) {
    if (!enabled || !account) return null;
    if (now() < pausedUntil) return null;
    const record = readRecord();
    if (record?.email === account.email) return pushDelta(record, keepalive);
    const data = await request("/api/sync");
    return reconcile(sanitizeState(data.state), data.revision);
  }

  function queue(work) {
    chain = chain.catch(() => {}).then(work);
    return chain;
  }

  // Adopt the session fields from an auth/refresh reply. expiresIn is seconds from
  // now; without it we simply fall back to the reactive 401 refresh path.
  function setSession(data) {
    token = typeof data.token === "string" ? data.token : "";
    if (typeof data.refreshToken === "string" && data.refreshToken) refreshToken = data.refreshToken;
    const secs = Number(data.expiresIn);
    expiresAt = Number.isFinite(secs) && secs > 0 ? now() + secs * 1000 : 0;
  }

  // Trade the stored refresh token for a fresh access token. Coalesces concurrent
  // callers onto one request; a rejected token is dropped so the next 401 signs out.
  function doRefresh() {
    if (!refreshToken) return Promise.resolve(false);
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const data = await request("/api/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
          auth: false,
        });
        if (data && typeof data.token === "string" && data.token) {
          setSession(data);
          return true;
        }
        return false;
      } catch {
        token = "";
        refreshToken = "";
        expiresAt = 0;
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function authenticate(path, email, password, seed) {
    const payload = { email, password };
    if (seed) {
      // Never seed an account with a running timer from the device that made it.
      const state = sanitizeState(seed);
      state.focusTimer = freshFocusTimer();
      payload.state = state;
    }
    const data = await request(path, { method: "POST", body: JSON.stringify(payload), auth: false });
    // Confirmation is on and no session came back: stay local and let the caller
    // prompt the learner to confirm their email, then sign in. Nothing is stored.
    if (data && data.pending)
      return { pending: true, email: typeof data.email === "string" ? data.email : email };
    setSession(data);
    setAccount({ email: typeof data.email === "string" ? data.email : email });
    await reconcile(sanitizeState(data.state), data.revision);
    return account;
  }

  return {
    get enabled() { return enabled; },
    get account() { return account; },
    get lastSynced() { return lastSynced || readRecord()?.lastSynced || 0; },
    // The current in-memory session bearer, for callers that authenticate a
    // learner to a sibling service (the tutor proxy). Empty when signed out.
    // Cross-site cookies do not reach the tutor's origin, so it takes the token.
    sessionToken() { return token || ""; },

    // One request at boot to learn whether the cookie still names a session.
    // Failure of any kind leaves the app exactly as local as it already was.
    restore() {
      if (!enabled) return Promise.resolve(null);
      return queue(async () => {
        try {
          const data = await request("/api/me");
          setAccount({ email: data.email });
          lastSynced = readRecord()?.lastSynced || 0;
          await syncNow();
          return account;
        } catch {
          return null;
        }
      });
    },
    signup(email, password, seed) {
      if (!enabled) return Promise.resolve(null);
      return queue(() => authenticate("/api/auth/signup", email, password, seed));
    },
    login(email, password) {
      if (!enabled) return Promise.resolve(null);
      return queue(() => authenticate("/api/auth/login", email, password));
    },
    logout() {
      if (!enabled) return Promise.resolve(null);
      clearTimeout(timer);
      timer = null;
      return queue(async () => {
        try { await request("/api/auth/logout", { method: "POST" }); }
        catch { /* Signing out locally matters more than telling the service. */ }
        token = "";
        refreshToken = "";
        expiresAt = 0;
        lastSynced = 0;
        // Dropping the baseline is what makes the next sign-in merge rather
        // than replay a stale delta, and it takes this account's progress copy
        // off a device the learner may be handing to someone else.
        try { storage().removeItem(SYNC_KEY); } catch { /* Nothing to clear. */ }
        setAccount(null);
        return null;
      });
    },
    syncNow() {
      if (!enabled || !account) return Promise.resolve(null);
      pausedUntil = 0;
      clearTimeout(timer);
      timer = null;
      return queue(() => syncNow());
    },
    // Coalesce the bursts of saves a keystroke or a finished lesson produces.
    schedule() {
      if (!enabled || !account) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        queue(() => syncNow()).catch(onError);
      }, debounceMs);
    },
    // The page is going away. sendBeacon cannot set X-Forge-Sync, and that
    // header is exactly what stops another site driving this API, so use a
    // keepalive fetch instead of weakening the check.
    flush() {
      if (!enabled || !account) return Promise.resolve(null);
      clearTimeout(timer);
      timer = null;
      return queue(() => syncNow(true)).catch(() => null);
    },
  };
}

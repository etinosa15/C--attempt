// The static build replaces these values. The local edition keeps its own runner.
export const hosted = false;
// Origin of the accounts and sync service. Empty means no accounts at all: the
// app stays exactly as local-first as it was, with no network calls and no UI
// asking anyone to sign in. Set FORGE_SYNC_ORIGIN at build time to enable it.
export const syncOrigin = "";

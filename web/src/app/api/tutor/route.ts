import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlement } from "@/lib/entitlements/server";
import { canUseAiTutor } from "@/lib/entitlements/gating";
import { utcDayKey, TUTOR_DAILY_LIMIT } from "@/lib/tutor/quota";
// Reuse the PURE, already-tested prompt builder (tutor/prompt.mjs) rather than
// re-implementing it — it guarantees the one security-critical property (coach,
// never ship the worked solution) in a single place the proxy also uses.
import { buildAnthropicRequest, extractMessage } from "../../../../../tutor/prompt.mjs";

export const runtime = "nodejs";

// POST /api/tutor — the hosted, metered AI tutor (Phase 5). A Socratic hint on a
// failing lesson, as a Pro perk, metered per-user so the Anthropic bill is bounded.
//
// The flow, server-authoritative at every step:
//   1. resolve the learner (cookie or bearer);           401 if signed out
//   2. gate on the aiTutor entitlement (Pro only);       403 otherwise (UI falls
//      back to the offline heuristic nudge)
//   3. no API key in this env → { configured:false };    (UI stays offline)
//   4. check today's per-user quota;                     429 when exhausted
//   5. build the request via the shared pure builder;    400 on a bad payload
//   6. call Anthropic with the server-only key;          502 on any upstream issue
//   7. only on success, atomically bump the usage count  (a failed hint is free).
//
// The key is read here and NEVER returned to the browser. Entitlement + quota are
// re-checked here regardless of what the client claims.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const UPSTREAM_MS = 20000;

type AnthropicBody = { model: string; max_tokens: number; system: string; messages: unknown[] };
const build = buildAnthropicRequest as (
  payload: unknown,
  opts: { model: string },
) => AnthropicBody | null;
const extract = extractMessage as (res: unknown) => string;

function dailyLimit(): number {
  const n = Number(process.env.TUTOR_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : TUTOR_DAILY_LIMIT;
}

export async function POST(request: Request) {
  const { supabase, user } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the tutor." }, { status: 401 });
  }

  // Pro-only. Free/lapsed learners keep the offline heuristic nudge (client falls
  // back on this 403), so the gate only decides whether the hosted hint is offered.
  const entitlement = await getEntitlement(supabase, user.id);
  if (!canUseAiTutor(entitlement)) {
    return NextResponse.json({ error: "The AI tutor is a Pro feature." }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Not configured in this environment — honest, and the client stays offline.
    return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const day = utcDayKey(new Date());
  const limit = dailyLimit();
  const userId = user.id;

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = build(payload, { model: process.env.TUTOR_MODEL || DEFAULT_MODEL });
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Reserve one hint ATOMICALLY before calling Anthropic (bug audit H3): the DB
  // increments only if the learner is under the daily cap, so parallel requests
  // can't blow the limit and the Anthropic bill stays bounded.
  const admin = createAdminClient();
  let reserved: number | null = null;
  try {
    const { data } = await admin.rpc("reserve_tutor_hint", { p_user: userId, p_day: day, p_limit: limit });
    reserved = typeof data === "number" ? data : null;
  } catch {
    // Fail closed: if the reservation can't be made, don't spend Anthropic budget.
    return NextResponse.json(
      { error: "The tutor is unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (reserved === null) {
    return NextResponse.json(
      { error: "You've used today's tutor hints. They refresh tomorrow.", remaining: 0 },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  const remaining = Math.max(0, limit - reserved);

  // Any failure from here gives the reserved hint back (a failed hint is free).
  const refund = async () => {
    try {
      await admin.rpc("release_tutor_hint", { p_user: userId, p_day: day });
    } catch {
      /* best effort — a metering hiccup shouldn't surface to the learner */
    }
  };

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), UPSTREAM_MS);
  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch {
    await refund();
    return NextResponse.json({ error: "The tutor is unavailable right now." }, { status: 502 });
  } finally {
    clearTimeout(deadline);
  }
  if (!upstream.ok) {
    await refund();
    return NextResponse.json({ error: "The tutor is unavailable right now." }, { status: 502 });
  }
  let data: unknown = null;
  try {
    data = await upstream.json();
  } catch {
    data = null;
  }
  const message = extract(data);
  if (!message) {
    await refund();
    return NextResponse.json({ error: "The tutor is unavailable right now." }, { status: 502 });
  }

  return NextResponse.json({ message, remaining }, { headers: { "Cache-Control": "no-store" } });
}

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { failure } from "./membership.mjs";
import { planPrice } from "./public/plans.js";

export function validSignature(raw, signature, key) {
  if (!key || !/^[a-f0-9]{128}$/i.test(signature || "")) return false;
  return timingSafeEqual(createHmac("sha512", key).update(raw).digest(), Buffer.from(signature, "hex"));
}
export function periodEnd(paidAt, billing) {
  const date = new Date(paidAt), day = date.getUTCDate();
  date.setUTCDate(1);
  if (billing === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
export function createBilling(config, members, { fetchImpl = fetch } = {}) {
  const { env, origin, production } = config;
  const key = env.PAYSTACK_SECRET_KEY || "";
  const mode = key.startsWith("sk_live_") ? "live" : "test";
  const plans = { monthly: env.PAYSTACK_MONTHLY_PLAN, yearly: env.PAYSTACK_YEARLY_PLAN };
  const legalReady = Boolean(env.OPERATOR_NAME && env.SUPPORT_EMAIL && env.BUSINESS_ADDRESS && env.LEGAL_APPROVED === "true");
  const enabled = /^sk_(test|live)_\S+$/.test(key) && Object.values(plans).every(v => /^PLN_[a-zA-Z0-9]+$/.test(v || "")) &&
    (mode !== "live" || (production && legalReady && members.emailEnabled && env.ENABLE_LIVE_PAYMENTS === "true" && env.FORGE_ENFORCE_PLANS === "true"));
  const locks = new Set();
  async function api(endpoint, body) {
    let response, result;
    try {
      response = await fetchImpl(`https://api.paystack.co${endpoint}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
      result = await response.json();
    } catch { throw failure(502, "The payment service could not be reached. Please try again later."); }
    if (!response.ok || result.status !== true) throw failure(502, "The payment service could not complete the request. Your account has not been upgraded.", { providerStatus: response.status });
    return result.data;
  }
  async function checkPlan(billing) {
    const data = await api(`/plan/${encodeURIComponent(plans[billing])}`);
    if (data.plan_code !== plans[billing] || Number(data.amount) !== planPrice(billing).total * 100 || data.currency !== "NGN" || data.interval !== (billing === "yearly" ? "annually" : "monthly"))
      throw failure(503, "This billing plan is not configured correctly. Please contact support.");
  }
  const planCode = transaction => typeof transaction.plan === "string" && transaction.plan.startsWith("PLN_") ? transaction.plan : transaction.plan?.plan_code || transaction.plan_object?.plan_code;
  async function reconcile(reference, ownerId) {
    if (!/^[A-Za-z0-9._=-]{6,150}$/.test(reference || "")) throw failure(400, "Invalid payment reference.");
    const initial = members.store.read();
    const order = initial.orders[reference];
    if (ownerId && order?.userId !== ownerId) throw failure(404, "Payment not found for this account.");
    if (order?.status === "paid") return order;
    let tx;
    try { tx = await api(`/transaction/verify/${encodeURIComponent(reference)}`); }
    catch (error) {
      if (error.providerStatus === 404 && order) { await members.store.transaction(data => { data.orders[reference].status = "failed"; }); throw failure(409, "No charge was found for that checkout. You can start a new checkout."); }
      throw error;
    }
    if (tx.status !== "success") {
      if (order && ["failed", "abandoned", "reversed"].includes(tx.status)) await members.store.transaction(data => { data.orders[reference].status = tx.status; });
      throw failure(409, ["failed", "abandoned", "reversed"].includes(tx.status) ? "This payment did not complete. You can start a new checkout." : "Payment is not confirmed yet. You can check again from your account.");
    }
    const code = planCode(tx), billing = Object.keys(plans).find(b => plans[b] === code);
    if (tx.reference !== reference || !billing || tx.currency !== "NGN" || Number(tx.amount) !== planPrice(billing).total * 100 || tx.domain !== mode) throw failure(400, "Payment details do not match this plan.");
    const paidAt = Date.parse(tx.paid_at || tx.paidAt);
    if (!Number.isFinite(paidAt) || paidAt > Date.now() + 300000) throw failure(400, "Payment date could not be verified.");
    let user = order ? initial.users[order.userId] : Object.values(initial.users).find(u => u.membership?.customerCode === tx.customer?.customer_code && u.membership?.planCode === code);
    if (!user || (ownerId && user.id !== ownerId) || user.email !== tx.customer?.email?.toLowerCase() || (order && order.billing !== billing)) throw failure(400, "Payment ownership could not be verified.");
    const until = periodEnd(paidAt, billing);
    return members.store.transaction(data => {
      if (data.orders[reference]?.status === "paid") return data.orders[reference];
      const current = data.users[user.id], previous = current.membership || {};
      if (until >= (previous.paidUntil || 0)) current.membership = { ...previous, billing, paidUntil: until, mode, planCode: code, customerCode: tx.customer?.customer_code,
        subscriptionCode: typeof tx.subscription === "string" ? tx.subscription : tx.subscription?.subscription_code || previous.subscriptionCode,
        cancelAtPeriodEnd: previous.planCode === code ? !!previous.cancelAtPeriodEnd : false };
      return data.orders[reference] = { userId: user.id, billing, amount: Number(tx.amount), reference, status: "paid", paidAt, paidUntil: until, mode, createdAt: order?.createdAt || paidAt };
    });
  }
  async function handle(req, res, url, context) {
    if (!url.pathname.startsWith("/api/billing")) return false;
    const { json, readBody, readRaw, guard } = context;
    try {
      if (url.pathname === "/api/billing/webhook" && req.method === "POST") {
        const raw = await readRaw(262144);
        if (!enabled || !validSignature(raw, req.headers["x-paystack-signature"], key)) throw failure(401, "Invalid webhook signature.");
        let event;
        try { event = JSON.parse(raw); } catch { throw failure(400, "Invalid webhook."); }
        if (event.event === "charge.success") await reconcile(event.data?.reference);
        if (["subscription.create", "subscription.disable", "subscription.not_renew"].includes(event.event)) {
          const sub = event.data;
          await members.store.transaction(data => {
            const user = Object.values(data.users).find(u => u.membership?.customerCode === sub?.customer?.customer_code && u.membership?.planCode === sub?.plan?.plan_code);
            if (user) {
              if (event.event === "subscription.create") user.membership.subscriptionCode = sub.subscription_code;
              else if (user.membership.subscriptionCode === sub.subscription_code) user.membership.cancelAtPeriodEnd = true;
            }
          });
        }
        json(200, { received: true }); return true;
      }
      const user = members.requireUser(req);
      if (url.pathname === "/api/billing" && req.method === "GET") {
        const orders = Object.values(members.store.read().orders).filter(o => o.userId === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30)
          .map(({ reference, billing, amount, status, paidAt, mode, createdAt }) => ({ reference, billing, amount, status, paidAt, mode, createdAt }));
        json(200, { enabled, mode, user: members.publicUser(user), orders }); return true;
      }
      guard();
      if (!enabled) throw failure(503, "Checkout is not connected yet. You can still explore the Premium preview.");
      const input = await readBody();
      if (input.accountId !== user.id) throw failure(403, "Your signed-in account changed. Reload before managing billing.");
      members.rate(`billing:${user.id}`, 15, 60000);
      if (url.pathname === "/api/billing/checkout" && req.method === "POST") {
        if (!user.verified) throw failure(403, "Verify your email before starting a subscription.");
        if (!Object.hasOwn(plans, input.billing)) throw failure(400, "Choose monthly or yearly billing.");
        if (input.acceptBilling !== true) throw failure(400, "Review and accept the recurring billing terms first.");
        if (members.entitlement(user)) throw failure(409, "You already have an active plan. Manage it from Account.");
        if (locks.has(user.id)) throw failure(409, "A checkout request is already in progress.");
        locks.add(user.id);
        try {
          const existing = Object.values(members.store.read().orders).find(o => o.userId === user.id && o.status === "pending");
          if (existing) throw failure(409, "A payment is already pending. Check its status in Account before starting another.");
          await checkPlan(input.billing);
          const reference = `forge-${randomBytes(18).toString("hex")}`;
          await members.store.transaction(data => { data.orders[reference] = { reference, userId: user.id, billing: input.billing, amount: planPrice(input.billing).total * 100, status: "pending", createdAt: Date.now(), mode }; });
          const checkout = await api("/transaction/initialize", { email: user.email, amount: planPrice(input.billing).total * 100, currency: "NGN", plan: plans[input.billing], reference, callback_url: `${origin}/?payment=${reference}#billing-return`, metadata: { forge_account_id: user.id }, channels: ["card"] });
          const destination = new URL(checkout.authorization_url);
          if (destination.protocol !== "https:" || destination.hostname !== "checkout.paystack.com") throw failure(502, "An unexpected checkout URL was returned.");
          await members.store.transaction(data => { data.orders[reference].checkoutUrl = destination.href; });
          json(200, { url: destination.href, reference, mode });
        } finally { locks.delete(user.id); }
        return true;
      }
      if (url.pathname === "/api/billing/verify" && req.method === "POST") {
        await reconcile(input.reference, user.id); json(200, { user: members.publicUser(members.store.read().users[user.id]) }); return true;
      }
      if (url.pathname === "/api/billing/resume" && req.method === "POST") {
        const order = members.store.read().orders[input.reference];
        if (order?.userId !== user.id || order.status !== "pending" || !order.checkoutUrl || order.createdAt < Date.now() - 86400000) throw failure(404, "This checkout is no longer available. Contact support if a payment is pending.");
        json(200, { url: order.checkoutUrl }); return true;
      }
      if (url.pathname === "/api/billing/cancel" && req.method === "POST") {
        if (input.confirm !== true) throw failure(400, "Confirm that you want to stop renewal.");
        let code = user.membership?.subscriptionCode;
        if (!code) {
          // The initial charge can arrive before subscription.create; resolve only this customer's plan.
          const subscriptions = await api(`/subscription?customer=${encodeURIComponent(user.membership?.customerCode || "")}&perPage=100`);
          code = Array.isArray(subscriptions) ? subscriptions.find(s => s.plan?.plan_code === user.membership?.planCode && s.customer?.customer_code === user.membership?.customerCode && s.status === "active")?.subscription_code : null;
        }
        if (!code) throw failure(409, "The subscription is still being confirmed. Try again shortly, or contact support to stop renewal.");
        const sub = await api(`/subscription/${encodeURIComponent(code)}`);
        if (sub.customer?.customer_code !== user.membership?.customerCode || sub.plan?.plan_code !== user.membership?.planCode) throw failure(403, "Subscription ownership could not be verified.");
        await api("/subscription/disable", { code, token: sub.email_token });
        await members.store.transaction(data => { data.users[user.id].membership.cancelAtPeriodEnd = true; data.users[user.id].membership.subscriptionCode = code; });
        json(200, { user: members.publicUser(members.store.read().users[user.id]) }); return true;
      }
      throw failure(404, "Billing endpoint not found.");
    } catch (error) { json(error.status || 500, { error: error.status ? error.message : "Billing could not complete this request." }); }
    return true;
  }
  return { enabled, mode, handle, reconcile };
}

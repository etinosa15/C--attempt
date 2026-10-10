// Paystack catalog — the pure map from a pricing-page selection (?plan=&billing=)
// to what Paystack needs to charge it. Reuses the shared, provider-agnostic
// PlanSelection/BillingCycle vocabulary (and resolveSelection for validation);
// only the *target* differs from Paddle:
//
//   - A recurring plan (pro:monthly / pro:annual) is a Paystack **Plan**, whose
//     plan code (`PLN_…`) lives in an env var — passing `plan` to the transaction
//     init makes Paystack charge the plan's amount and start a subscription.
//   - Lifetime is a **one-time amount** (integer **kobo**, NGN's minor unit) in an
//     env var — there is no plan; we charge the amount once.
//
// Prices themselves live in the Paystack dashboard (plans) or in env (the lifetime
// amount), never hardcoded here — same discipline as the Paddle catalog.
import type { PlanSelection } from "./catalog";

/** What Paystack needs to start the right charge for a selection. */
export type PaystackTarget =
  | { kind: "plan"; planCodeEnv: string }
  | { kind: "amount"; amountEnv: string };

const TARGETS: Record<string, PaystackTarget> = {
  "pro:monthly": { kind: "plan", planCodeEnv: "PAYSTACK_PLAN_PRO_MONTHLY" },
  "pro:annual": { kind: "plan", planCodeEnv: "PAYSTACK_PLAN_PRO_ANNUAL" },
  lifetime: { kind: "amount", amountEnv: "PAYSTACK_AMOUNT_LIFETIME" },
};

/** The env-var name holding the price target for a (validated) selection. */
export function targetFor(selection: PlanSelection): PaystackTarget {
  if (selection.plan === "lifetime") return TARGETS.lifetime;
  const cycle = selection.billing === "monthly" ? "monthly" : "annual";
  return TARGETS[`pro:${cycle}`];
}

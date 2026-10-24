# OWNER_GUIDE: how to do each item in OWNER_TODO.md

Plain steps, in a sensible order. Do them top to bottom. Never paste a secret key
into chat, a commit, or a screenshot.

Already handled in code (you can tick these):
- "Works offline" claim: the landing FAQ now says what is true (no full offline mode).
- Consent on signup: a text line linking Terms and Privacy is live. Ask if you want a checkbox instead.
- Payments bug fixes H1 and H2: done and merged.

---

## Step 1. Pick your support email and seller name (section B, first item)
1. Create an email just for the app, for example `support@yourdomain` or a Gmail like `forgecodeacademy.help@gmail.com`.
2. Decide the name shown as the seller. Because you are under 18, this is usually the trusted adult who will own the Paystack account, or a registered business name if you have one.
3. Send both to me and I will put them in the footer, Terms and Refund pages.
Done when: you have the email address and the name written down.

## Step 2. Decide the money story while payments are off (section A)
1. Answer these three questions:
   - Keep showing prices now, or hide the pricing page until Paystack is live? (Recommended: show "Free today, paid plans coming".)
   - Is a card required for the 7-day trial? (Today the app says "No card required". Recommended: keep it that way.)
   - What exactly does Lifetime include? Write one sentence such as "All current tracks and any new lessons added to them." Avoid "every future feature".
2. Send me your answers. I will update About, Terms, Refund and Pricing so they all say the same thing, and move "C# in the browser" and "AI tutor" into a separate "Coming later" list that is not part of the purchase.
Done when: every page tells the same story.

## Step 3. Legal pages (section B, remaining items)
1. Ask me to draft Privacy and Terms. I will list every service the app uses: Supabase, Paystack, Google and GitHub sign-in, Vercel, Render, PostHog and the email sender.
2. Decide the minimum age (for example 13+ with a parent's permission for under-18s).
3. Have the trusted adult, or ideally a lawyer, read both drafts before they go live. Nigeria's data law is the NDPA; mention it to them.
Done when: a real person has approved the text and it shows a "Last updated" date.

## Step 4. One website, not two (section C)
You have the old studio on Render and the new app on Vercel. Keep Vercel.
1. Optional: buy a domain (e.g. on Namecheap or Whogohost), then in Vercel open your project > Settings > Domains > Add, and follow the DNS records it shows you.
2. In Vercel > Settings > Environment Variables, set `NEXT_PUBLIC_SITE_URL` to your final address (e.g. `https://forgecode.app`). Redeploy.
3. Supabase dashboard > Authentication > URL Configuration:
   - Site URL = your final address.
   - Redirect URLs: keep only `https://YOUR-ADDRESS/auth/callback` and `http://localhost:3000/auth/callback`. Delete Render and old preview URLs.
4. Google Cloud Console > APIs & Services > Credentials > your OAuth client: make sure the redirect URI is the Supabase callback only, and remove old Render entries. Do the same in GitHub > Settings > Developer settings > OAuth Apps.
5. Render dashboard > the `forge-code-academy` service: either delete it, or replace its site with a redirect to the new address. Tell me which and I can add the redirect rule.
Done when: only one address works, and signing in with Google and GitHub still works there.

## Step 5. Email deliverability (section E)
This needs a domain from Step 4.
1. Pick an email sender for auth emails (Supabase's built-in one is rate-limited). Resend or Brevo are easy and free to start.
2. In the sender's dashboard, add your domain. It will show 3 to 4 DNS records (SPF, DKIM, and sometimes a return-path).
3. Copy each record into your domain registrar's DNS page exactly as shown.
4. Add one DMARC record yourself: type `TXT`, name `_dmarc`, value `v=DMARC1; p=quarantine; rua=mailto:YOUR-SUPPORT-EMAIL`.
5. Back in Supabase > Project Settings > Authentication > SMTP Settings, enter the sender's SMTP details.
6. Send yourself a password reset and check it lands in the inbox, not spam.
7. Ask me to add `/.well-known/security.txt` with your support email.
Done when: reset emails arrive in the inbox.

## Step 6. Monitoring and dependency alerts (section F)
1. Sign up at sentry.io (free plan), create a "Next.js" project, and copy the DSN. Send me only that it is ready; put the DSN in Vercel env as `NEXT_PUBLIC_SENTRY_DSN` yourself, and I will wire it up.
2. GitHub > your repo > Settings > Code security > turn on **Dependabot alerts** and **Dependabot security updates**.
3. Decide on the "lesson content is in the browser" risk: fine while the app is free. Before charging, tell me whether paid lessons must be locked on the server.
Done when: Sentry shows a test error and Dependabot is on.

## Step 7. Paystack go-live (section D). Do this last, needs an 18+ adult.
1. The adult signs up at paystack.com, completes Compliance (ID, BVN, bank account, business details) and waits for approval.
2. Paystack dashboard > Settings > API Keys & Webhooks: copy the **live** secret key. Do not share it with anyone, including me.
3. Paystack > Products > Plans: create "Pro Monthly" (₦3,500, monthly) and "Pro Annual" (₦24,000, annually). Copy each plan code (looks like `PLN_xxxx`).
4. In Vercel > Settings > Environment Variables (Production), add:
   - `PAYSTACK_SECRET_KEY` = live secret key
   - `PAYSTACK_PLAN_PRO_MONTHLY` and `PAYSTACK_PLAN_PRO_ANNUAL` = the plan codes
   - `PAYSTACK_AMOUNT_LIFETIME` = `4000000` (₦40,000 in kobo)
   - `NEXT_PUBLIC_PRICE_*` values if you changed prices
5. Paystack > Settings > API Keys & Webhooks > Webhook URL: `https://YOUR-ADDRESS/api/webhooks/paystack`. Save.
6. Redeploy on Vercel.
7. Smoke test with a real small purchase: sign up a fresh account, choose a plan, pay, check the plan shows Pro, check the receipt email, then cancel from the account page and refund yourself from the Paystack dashboard.
8. Tell me before step 7 so I can finish the remaining lower-risk webhook items (idempotency, out-of-order events).
Done when: the test purchase unlocks Pro and the cancel works.

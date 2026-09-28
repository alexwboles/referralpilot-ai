# ReferralPilot AI

A referral program tracker for local businesses. Generate referral codes, design reward rules, track referrals through a status pipeline, rank your top referrers, and share ready-made SMS/email invites.

## Features

1. **Referral code generator** — business prefix + batch generation (e.g. 10 codes like `MAIN-ST-7K2Q`), uniqueness guaranteed within a batch, copy-to-clipboard per code, persisted in `localStorage`.
2. **Reward rule builder** — set give/get amounts, reward type ($ off / % off / freebie), and an optional minimum purchase. Get a plain-English summary ("Give $10, get $10, min purchase $25") plus the estimated cost per completed referral.
3. **Referral tracker** — add referrals (code, referrer, friend) and advance them through sent → completed → rewarded. Skipping steps is rejected (you can't go straight from sent to rewarded).
4. **Referrer leaderboard** — ranked by completed referrals, ties broken by rewarded count. Shows sent/completed/rewarded per referrer and total rewards paid.
5. **Share-message templates** — SMS + email templates with `{business}`, `{code}`, `{give}`, `{get}` placeholders and a live preview filled in from your current rule.
6. **Stats bar** — totals for sent/completed/rewarded, sent→completed conversion rate, and rewards owed (completed but not yet rewarded × get amount).

## How to run

Just open `index.html` in any modern browser. No build step, no server, no install.

Optional quick test run (needs Node):

```bash
chmod +x test/smoke.sh test/e2e.sh
./test/smoke.sh
./test/e2e.sh
```

## Notes

- **100% free** — no paid services, no subscriptions.
- **Local-first** — all data lives in your browser's `localStorage`. Nothing is sent anywhere.
- **Zero API keys required** — there are no network calls at all.
- Pure logic lives in `js/logic.js` (browser + Node compatible); `js/app.js` is UI wiring only.

# REDESIGN-AUDIT — referralpilot-ai (2026-10-13)

Referral program tracker for local businesses: code generator, reward-rule
builder, referral tracker (sent → completed → rewarded), leaderboard with
tiers, referrer-of-month spotlight, program ROI, share-message templates.
Functionally complete; the gaps vs ReferralCandy are presentational.

## Competitors referenced
- **ReferralCandy** — advocate portal with rewards dashboard + referral progress
  ("what unlocks at the next tier"); **Friend Offer landing page** (the offer as
  the customer sees it); tiered rewards (FlexiTiers); program performance
  dashboard connecting advocates, shares, purchases, revenue.

## Gaps found (visual / functional / flow)

### Functional
1. Tier "next" data exists (`tierFor` returns nextTier/needed) but is shown as a
   tiny sub-line — ReferralCandy makes tier progress the hero of the advocate
   view. Needs visual weight (progress bars, "X to Gold").
2. No customer-facing view of the offer. ReferralCandy's Friend Offer landing
   page is core to the product; here the rule is only numbers in inputs.

### Visual
3. Generic dark topbar + tab strip — reads as an admin template, not growth
   software. ReferralCandy reads warm, celebratory, reward-focused.
4. Leaderboard is a plain table; top referrers deserve a podium moment.
5. Stats bar is flat; conversion/rewards-owed deserve a "mission control" feel.

### Flow
6. Tab flow works; keep. The reward-rule tab should lead with the friend offer
   (what the customer sees), then the economics.

## Redesign plan
- **Identity: "The growth engine."** Dark cocoa sidebar (#26160f), warm cream
  workspace, raspberry-rose accent (#d1345b — ReferralCandy's celebratory pink,
  distinct from every other pilot tool), gold for tiers.
- **Sidebar shell**: brand, vertical nav (Codes / Reward rule / Tracker /
  Leaderboard / Share), business-name field, clear-data, local pill.
- **Stats band**: dark mission-control strip with rose numerals.
- **Friend Offer card** (new, on the rule tab): live preview of the offer as a
  customer would see it — "Give $10, Get $10" hero card, updates as the rule
  inputs change.
- **Leaderboard podium**: top-3 referrers on gold/silver/bronze steps; tier
  progress bars + "X to {next}" on every row.
- Preserve: all tabs, tracker tables, stale follow-ups, monthly/channel trends,
  spotlight, ROI, templates, CSV export, toasts.

## Non-goals
- A real public advocate portal (needs hosting; local-first is the promise).
- Automated reward payouts (out of scope for a tracker).

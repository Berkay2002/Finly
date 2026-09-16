# Finly — Technical Plan

Companion to `Personal Finance Planner — Product Requirements & Handoff.md` and the screens in `design/`.
The PRD defines *what*; this document defines *how* for the first build.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Stack | React 19, TypeScript, Vite, Tailwind CSS v4 | One responsive codebase covers both the desktop and mobile designs. No server required, apart from one cached function for rate data (see Server functions). |
| Routing | react-router v7 | Each onboarding step and each sidebar section is a URL, so the browser back button and deep links work. |
| State | Zustand with `persist` to `localStorage` | Planning Mode needs no backend. The store is the only place a sync layer would later plug in. |
| Charts | Recharts | Donut and bar charts in the design; small API surface. |
| Icons | lucide-react | Matches the thin-line icon style in the design. |
| Dates | date-fns | Goal completion dates, upcoming-expense calendars. |
| Tests | Vitest | The calculation engine is pure TypeScript and is tested exhaustively. |
| Scope | Full Planning Mode | Onboarding, summary, dashboard, section pages, accounts, savings and goals, planning tools. Tracking Mode (history that survives across months) follows in two phases; see below. |

## Architecture

```
src/
  engine/        Pure TypeScript. No React, no store. Every number on the dashboard comes from here.
    types.ts       FinancialPlan and its entities
    frequency.ts   Monthly and annual equivalents of any frequency
    taxonomy.ts    Categories, suggested items per onboarding step, default classifications
    metrics.ts     Core numbers: essential/lifestyle/planned cost, breathing room, safe to spend, runways, position
    projections.ts Upcoming expenses, expensive months, goal completion, 12-month projection
    scenarios.ts   "Can I afford this?" and income-change what-ifs, with before/after comparison
    debts.ts       Loans: interest/repayment split, payoff simulation, amorteringskrav, ränteavdrag, payoff order
    rates.ts       Where loan rates are heading: policy rate path, projected CSN rate, bunden resets, +1 pp shock
    format.ts      Money, percent, month formatting
  store/         Zustand store, selectors, sample data
  components/    ui primitives, layout (sidebar, bottom nav, top bar), forms, charts
  pages/         Onboarding steps, dashboard, section pages, accounts, savings, planning tools, insights, settings
  lib/rateOutlook.ts  Fetches /api/rates once a day per browser; falls back to the outlook bundled in rates.ts
api/
  rates.ts       Vercel Function: Riksbank policy rate and forecast, cached a day on Vercel's CDN
```

The engine is the product. The UI is a thin projection of `computeMetrics(plan)`.

## Data model

Everything hangs off one `FinancialPlan`:

- **IncomeSource** — amount, frequency, `reliability` (reliable | variable), `includeInBaseline`.
- **ExpenseItem** — category (home | living | transport | finance | leisure | planned), subcategory, amount, frequency, optional `nextDate` for non-monthly items, and three independent classification flags from PRD §14: `fixed`, `essential`, `committed`. Tags (`car`, `subscription`, `insurance`, `utility`) power the deeper analyses (`debt` only survives on old plans; loans are their own model). `includedElsewhere` marks utilities bundled into rent so they are visible but excluded from totals.
  - Variable items may carry a `range` (`low`/`high` per period). `amount` stays the typical figure the plan budgets for; leave it at 0 to budget for the midpoint. `engine/amounts.ts` turns an item into a low/typical/high spread (bounds at 0 mean "same as typical"; bounds are ordered and widened so low ≤ typical ≤ high). Fixed items ignore the range.
  - `billingLag` (months) says which period a bill covers. Swedish utilities bill in arrears: January's usage is invoiced mid-February and paid at the end of February, so the lag is 1.
  - `actuals` records real bills keyed by the month they are paid (`YYYY-MM`). Until entered, a variable item is only an estimate.
  - `occurrences` (`times` per `week` | `month` | `year`) prices an item per purchase: `amount` and `range` are one lunch, one coffee, one haircut, and `frequency` mirrors `per`. Monthly = price × times (× 52/12 for weekly, ÷ 12 for yearly). A per-purchase item has no due date and never appears in the upcoming calendar, even per year. Everyday taxonomy items (groceries, cafés, fuel, parking, congestion charges…) offer only Each time, Weekly and Monthly, start in a sensible cadence (groceries weekly, work lunches 5 a week) and are never asked for as bills. Haircuts, dental visits, flights, rail trips, rental cars, events and birthdays start per time, a few times a year; those are not everyday spending.
  - `engine/actuals.ts` summarises recorded bills and, after three or more, suggests a rounded typical amount and range when the estimate on file is more than 5% off. The edit sheet shows the history and a one-tap "Use these".
- **Account** — kind (everyday | salary | savings | emergency | joint | cash | investment | other) and balance. Kind determines whether the balance counts as spendable, cash savings, emergency, or investment.
- **Debt** — kind (csn | mortgage | car | personal | credit_card | other), balance with month-keyed `balances`, `rate` (percent), `payment` + `frequency` (monthly | quarterly | yearly), `secured`, and kind-specific fields: `amortization` and `propertyValue` for a mortgage, `rateType` (variable | fixed) and `rateFixedUntil` (villkorsändringsdag) for a mortgage part, `csnType` and `nextDate` for CSN. Rules, formulas and sources: [swedish-loans.md](swedish-loans.md).
- **Household** — `members` with a Konsumentverket age band and `lunchAway` (school lunch or lunch bought at work). `engine/food.ts` holds Konsumentverket's *Hushållskostnader 2026* food table and turns the household into a monthly groceries estimate (their example: two adults 25–50, children 5 and 9 at school lunch = 8,440 kr). It is a reasonable level cooking at home, not spending statistics; the UI says so.
- **Commute** — `people`, each with days in a week, `mode` (public transport with a period card or single tickets, car with paid parking and trängselskatt passages a day, or walk/bike) and whether they buy lunch; plus remembered `prices`. `engine/commute.ts` turns it into counts (lunches = days, single tickets = 2 × days, one card per card holder, parking days, passages × days) and writes them to Work lunches, Bus/tram tickets, Monthly travel card, Parking and Congestion charges, priced per purchase. An item entered as a total keeps its monthly cost (price = total ÷ new count). A line that drops to zero is only removed when the previous commute had set it, and the user can keep it. The sheet also shows from how many days a week a card pays off (card ÷ (2 × ticket × 52/12)).
- **everydaySpend** — what was really spent per month in each everyday group (`food` | `transport` | `leisure` → `YYYY-MM` → `{ amount, asOf? }`), read off the bank app. With `asOf` it is a running total for the pace; without (or dated the last day) it covers the whole month. Everyday spending has no invoice, so the month gets one total per group instead of a bill per item. Groups (`engine/everyday.ts`): all Food & drink items; Transport items that are everyday spending plus the travel card; Leisure items that are everyday spending.
- **SavingsGoal** — kind, `purpose` (future_spending | long_term, PRD §2.4), current amount, monthly contribution, optional target amount and date.

All amounts are stored as entered with their frequency. Monthly equivalents are computed, never stored.

## Core formulas (monthly)

| Metric | Formula |
| --- | --- |
| Reliable income | Σ reliable sources |
| Variable income | Σ variable sources |
| Total income | reliable + variable (sources with `includeInBaseline = false` are excluded) |
| Spending cost | Σ all expense items (monthly equivalent), excluding `includedElsewhere` |
| Loan payments (`debt.monthly`) | Σ loan payments, monthly equivalent; split into `interest` and `principal` when balance and rate are known |
| Lifestyle cost | spending cost + loan payments |
| Essential cost | Σ items with `essential = true` + loan payments |
| Committed / flexible | split on `committed` |
| Planned saving / investing | Σ goal contributions by purpose |
| Planned cost | lifestyle + savings + investing |
| Breathing room (= unallocated) | total income − planned cost |
| Safe to spend this month | breathing room − one-off expenses dated this month |
| Savings rate | savings ÷ total income (also reported against reliable income) |
| Allocation | lifestyle % (without loan repayment), debt paydown %, future-spending %, long-term % of income |
| Cash in bank | everyday + salary + joint + savings + cash accounts |
| Total assets | all account balances |
| Net worth | total assets − Σ loan balances |
| Emergency cover | emergency balance ÷ essential cost |
| Essential runway | (cash in bank + emergency) ÷ essential cost |
| Lifestyle runway | (cash in bank + emergency) ÷ lifestyle cost |
| Daily allowance | (flexible spending + safe to spend) × days remaining ÷ days in month ÷ days remaining |
| Goal completion | ceil((target − current) ÷ contribution) months from today |
| Above-normal month | occurrences of non-monthly items in that month − lifestyle cost baseline |
| Range (`metrics.range`) | every figure above recomputed with variable items at their low / high: lifestyle, essential, per category, breathing room, safe to spend, and `swing` = high − low |
| Actuals (`metrics.actuals`) | for the viewed month: `pending` variable monthly items without a bill (everyday spending excluded), `confirmed` items with one, `variance` = Σ(actual − typical). A group's total for the whole month replaces the estimates of every item in the group and adds (spent − planned). Safe to spend subtracts the variance; the baseline plan is untouched |
| Everyday (`metrics.everyday`) | per group: items per month / week (× 12/52) / day (× 12/365), flexible part, `nudges` (one fewer purchase of an optional per-purchase item, biggest saving first), `month` pace (expected by now = planned × day ÷ days; projected = spent ÷ share of month; left per remaining day) and `history` (average of the last three complete months; a gap is flagged from two months when it exceeds 5 % and 100 kr, and offered as a change to groceries, or the group's largest item entered as a total) |
| Food (`metrics.food`) | `everyday.food` plus at home vs eating out |

## Screens and routes

| Route | Screen |
| --- | --- |
| `/onboarding/:step` | Ten steps: income, home, living, transport, finance, leisure, planned, savings, accounts, summary. Desktop shows a live summary sidebar; mobile shows a step grid and progress bar. |
| `/` | Dashboard, following the design's card layout and the PRD §20 hierarchy. A compact strip lists bills still estimated for the viewed month and opens a sheet to enter the real figures |
| `/income`, `/home`, `/living`, `/transport`, `/finance`, `/leisure`, `/planned` | Editable section pages with a stat strip and the same line-item editor as onboarding. Living Costs adds a Food & drink card (month/week/day, at home vs eating out, small changes, groceries estimate from the household) and a food-this-month card (running total and pace, last month's total, your months vs the plan). Transport adds the Commute card and sheet, a Getting around card and a this-month card; Leisure adds a Fun & leisure card and a this-month card |
| `/savings` | Goals list, savings split donut, 12-month projection |
| `/accounts` | Accounts list, allocation donut, financial position |
| `/loans` | Loans list, interest vs repayment, payoff order, amorteringskrav and CSN notes, "If rates change" (forecast payments, +1 pp, CSN next year), warnings before a bunden del resets |
| `/planning` | Can I afford this?, income-change scenario, daily/weekly allowance with food, getting around, and fun and leisure split out |
| `/insights` | Subscriptions, true car cost, annualised costs, reducible spending, allocation |
| `/settings` | Name, currency, export/import JSON, reset, load sample data |

Layout: sidebar at ≥ 1024px, bottom navigation below. The "More" tab opens a sheet with the remaining sections.

## Tracking Mode

Tracking Mode is not bank import. It means the data survives across months: what a month cost, what the
balances were and what the plan looked like at the time must still be readable a year later, and must not
be rewritten by later edits to the plan.

### What exists today

The store keeps `snapshots: Record<'YYYY-MM', MetricsSnapshot>`. When a prior month snapshot exists, the
dashboard, accounts and savings pages render "vs last month" deltas. Snapshots freeze `lifestyleCostActual`,
`actualVariance` and `billsConfirmed`, so the cost delta compares real bills month to month once any are
confirmed. Variable expenses carry `actuals` keyed by paid month, and the expense editor suggests a new
estimate once three bills are recorded.

Gaps: snapshots are only saved by a button on Settings, export contains the plan but not the snapshots,
account balances and goal progress are single numbers with no history, and viewing an earlier month runs
today's plan against an earlier date, so editing rent in October changes September too.

### Phase 1: local history (no backend) — implemented

1. **Automatic month close.** On load, if the previous month has no snapshot, save one. The Settings button
   stays as a manual override.
2. **Export everything.** The JSON file carries snapshots and bill actuals as well as the plan; import
   restores them.
3. **Month-keyed balances.** Accounts and goals store `balances: Record<'YYYY-MM', number>` the same way
   bills store `actuals`, with the latest value as the current balance. This gives net worth and goal
   progress over time.
4. **Freeze the plan at month close.** The snapshot includes a copy of the plan items, so a past month is
   rendered from the plan as it was, not the plan as it is now. Chosen over effective dates on every item
   because it needs no change to the editing model.

Size is not a concern: a frozen month is 15–25 KB (the plan copy is pruned to that month's bills and
carries no balance history), ten years of history a few MB against a 5 MB `localStorage` budget.

How it landed: `src/engine/history.ts` holds the pure snapshot logic (`buildSnapshot`, `freezePlan`,
`monthsToClose`); `useMonthClose` runs `closeMonths` on load and when the tab becomes visible; selectors
render a closed month from its frozen plan (`useEffectivePlan`) while editors always work on the live
plan; bill amounts entered in a closed month are written to both the live item and the frozen copy;
balances are keyed by the current calendar month; `src/store/planFile.ts` exports and imports the
`{ version: 2, plan, snapshots }` envelope and still reads the old bare plan.

### Phase 2: encrypted sync with a sync phrase (no accounts) — implemented

`localStorage` is bound to one browser, is lost when site data is cleared and is purged by iOS Safari after
seven days without a visit, which a monthly-use app will hit. The fix is durability, not a relational schema,
and it must not bring sign-up, email providers or OAuth with it. The model is Brave Sync: a generated phrase
is the whole identity.

- **Identity.** 16 random bytes shown once as a 12-word BIP39 phrase (`@scure/bip39`, English list, checksum).
  HKDF-SHA256 over the secret gives two independent values: a 64-hex **sync id** the server stores the data
  under, and an AES-GCM-256 **key** the server never sees. Knowing the id does not give the key.
- **Payload.** `{ payloadVersion, plan, snapshots }` → JSON → gzip (`CompressionStream`) → AES-GCM with a
  fresh 12-byte IV → base64. Gzip keeps decades of months far below the 1 MiB document limit. The profile
  picture is part of the plan as a 192 px JPEG data URL (10–25 KB), so it syncs encrypted like everything
  else and never touches Convex file storage; frozen months drop it.
- **Backend.** Convex, used as a blob store with no auth: one table `blobs { syncId, ciphertext, iv,
  version, updatedAt, size }`, one document per sync id, and three functions `get`, `put`, `remove`
  (`convex/blobs.ts`). `put` does an optimistic version check, rejects ciphertext over 900 000 characters and
  refuses more than one write per second per id. The sync id is a capability: holding it allows overwrite
  and delete but never read. It leaves the client only inside Convex calls.
- **Client.** `src/sync/`: `crypto.ts` (Web Crypto, testable in Node), `phrase.ts`, `resolve.ts`,
  `syncStore.ts` (zustand persist `finly.sync.v1`) and `useSync.ts`. `SyncController` is mounted once in the
  app shell: local edits are pushed after a 2 s pause, and the live query brings other devices' pushes here.
  A remote copy is applied through `replaceAll`, which does not bump `updatedAt`.
- **Conflicts.** A push with a stale version, or a remote change while this device has unsent edits, raises
  a banner: "Keep mine" or "Use theirs", with the newer copy (by `plan.updatedAt`) pre-selected. Closed months
  from both sides are kept either way. Nothing is overwritten silently.
- **Trade-off.** The secret is kept in `localStorage` next to the plan, which is already plaintext there, so
  it adds no exposure on the device; what it protects is the copy on the server. Losing the phrase loses the
  cloud copy only.
- **Without a backend.** When `VITE_CONVEX_URL` is unset the app runs exactly as before and the Settings card
  says sync is not configured.

A real schema is only worth it if server-side features arrive (shared households, reminders). Data can be
decrypted and migrated at that point.

## Server functions

The app is static apart from one Vercel Function (Node runtime; Edge Functions are deprecated).

- **`GET /api/rates`** (`api/rates.ts`). The Riksbank APIs send no CORS headers, so the browser cannot call them.
  The function makes two upstream calls (SWEA `SECBREPOEFF` from November four years back, and the
  monetary policy forecasts for `SEQRATENAYNA`) and returns a `RateOutlook`. It has no imports so Vercel runs
  it as-is.
- **Caching keeps it inside the Hobby plan.** Success: `s-maxage=86400, stale-while-revalidate=604800`, so
  the CDN runs it about once a day per region whatever the traffic. Failure: 502 with `s-maxage=900`. The
  client stores the answer in `localStorage` (`finly:rates:v1`) for 24 h and never waits on it: until it
  arrives, or when it fails, the outlook bundled in `src/engine/rates.ts` is used. Expected use is a few
  hundred invocations and well under a CPU-minute a month, against 1M invocations and 4 CPU-hours.
- **Riksbank limits.** The anonymous API answers 429 after a handful of quick calls. The CDN cache is what
  keeps us under it; do not call the function in a loop while testing.
- **Routing.** `vercel.json` rewrites everything except `/api/` to the SPA.
- **Local dev.** A small Vite plugin in `vite.config.ts` serves `/api/rates` by loading `api/rates.ts` with
  `ssrLoadModule`, so `npm run dev` behaves like production without `vercel dev`. `vite preview` has no
  `/api`; the app then uses the bundled outlook.

## Build order

1. Engine + tests
2. Design tokens and UI primitives
3. App shell, routing, store, sample data
4. Onboarding with live summary
5. Summary step
6. Dashboard
7. Section pages, accounts, savings and goals
8. Planning tools and insights
9. Settings, export/import
10. Type-check, tests, production build
11. Tracking Mode: local history (frozen months, month-keyed balances, automatic close)
12. Sync phrase on Convex (encrypted blob, conflict banner)
13. Loans as their own model (CSN, bolån, billån, credit), then rate forecasts through `/api/rates`

# Finly — Technical Plan

Companion to `Personal Finance Planner — Product Requirements & Handoff.md` and the screens in `design/`.
The PRD defines *what*; this document defines *how* for the first build.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Stack | React 19, TypeScript, Vite, Tailwind CSS v4 | One responsive codebase covers both the desktop and mobile designs. No server required. |
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
    format.ts      Money, percent, month formatting
  store/         Zustand store, selectors, sample data
  components/    ui primitives, layout (sidebar, bottom nav, top bar), forms, charts
  pages/         Onboarding steps, dashboard, section pages, accounts, savings, planning tools, insights, settings
```

The engine is the product. The UI is a thin projection of `computeMetrics(plan)`.

## Data model

Everything hangs off one `FinancialPlan`:

- **IncomeSource** — amount, frequency, `reliability` (reliable | variable), `includeInBaseline`.
- **ExpenseItem** — category (home | living | transport | finance | leisure | planned), subcategory, amount, frequency, optional `nextDate` for non-monthly items, and three independent classification flags from PRD §14: `fixed`, `essential`, `committed`. Tags (`car`, `subscription`, `debt`, `insurance`, `utility`) power the deeper analyses. `includedElsewhere` marks utilities bundled into rent so they are visible but excluded from totals.
  - Variable items may carry a `range` (`low`/`high` per period). `amount` stays the typical figure the plan budgets for; leave it at 0 to budget for the midpoint. `engine/amounts.ts` turns an item into a low/typical/high spread (bounds at 0 mean "same as typical"; bounds are ordered and widened so low ≤ typical ≤ high). Fixed items ignore the range.
  - `billingLag` (months) says which period a bill covers. Swedish utilities bill in arrears: January's usage is invoiced mid-February and paid at the end of February, so the lag is 1.
  - `actuals` records real bills keyed by the month they are paid (`YYYY-MM`). Until entered, a variable item is only an estimate.
  - `engine/actuals.ts` summarises recorded bills and, after three or more, suggests a rounded typical amount and range when the estimate on file is more than 5% off. The edit sheet shows the history and a one-tap "Use these".
- **Account** — kind (everyday | salary | savings | emergency | joint | cash | investment | other) and balance. Kind determines whether the balance counts as spendable, cash savings, emergency, or investment.
- **SavingsGoal** — kind, `purpose` (future_spending | long_term, PRD §2.4), current amount, monthly contribution, optional target amount and date.

All amounts are stored as entered with their frequency. Monthly equivalents are computed, never stored.

## Core formulas (monthly)

| Metric | Formula |
| --- | --- |
| Reliable income | Σ reliable sources |
| Variable income | Σ variable sources |
| Total income | reliable + variable (sources with `includeInBaseline = false` are excluded) |
| Lifestyle cost | Σ all expense items (monthly equivalent), excluding `includedElsewhere` |
| Essential cost | Σ items with `essential = true` |
| Committed / flexible | split on `committed` |
| Planned saving / investing | Σ goal contributions by purpose |
| Planned cost | lifestyle + savings + investing |
| Breathing room (= unallocated) | total income − planned cost |
| Safe to spend this month | breathing room − one-off expenses dated this month |
| Savings rate | savings ÷ total income (also reported against reliable income) |
| Allocation | lifestyle %, future-spending %, long-term % of income |
| Cash in bank | everyday + salary + joint + savings + cash accounts |
| Total assets | all account balances |
| Emergency cover | emergency balance ÷ essential cost |
| Essential runway | (cash in bank + emergency) ÷ essential cost |
| Lifestyle runway | (cash in bank + emergency) ÷ lifestyle cost |
| Daily allowance | (flexible spending + safe to spend) × days remaining ÷ days in month ÷ days remaining |
| Goal completion | ceil((target − current) ÷ contribution) months from today |
| Above-normal month | occurrences of non-monthly items in that month − lifestyle cost baseline |
| Range (`metrics.range`) | every figure above recomputed with variable items at their low / high: lifestyle, essential, per category, breathing room, safe to spend, and `swing` = high − low |
| Actuals (`metrics.actuals`) | for the viewed month: `pending` variable monthly items without a bill, `confirmed` items with one, `variance` = Σ(actual − typical). Safe to spend subtracts the variance; the baseline plan is untouched |

## Screens and routes

| Route | Screen |
| --- | --- |
| `/onboarding/:step` | Ten steps: income, home, living, transport, finance, leisure, planned, savings, accounts, summary. Desktop shows a live summary sidebar; mobile shows a step grid and progress bar. |
| `/` | Dashboard, following the design's card layout and the PRD §20 hierarchy. A compact strip lists bills still estimated for the viewed month and opens a sheet to enter the real figures |
| `/income`, `/home`, `/living`, `/transport`, `/finance`, `/leisure`, `/planned` | Editable section pages with a stat strip and the same line-item editor as onboarding |
| `/savings` | Goals list, savings split donut, 12-month projection |
| `/accounts` | Accounts list, allocation donut, financial position |
| `/planning` | Can I afford this?, income-change scenario, daily/weekly allowance |
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
  fresh 12-byte IV → base64. Gzip keeps decades of months far below the 1 MiB document limit.
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

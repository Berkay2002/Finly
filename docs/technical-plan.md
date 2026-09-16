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
| Scope | Full Planning Mode | Onboarding, summary, dashboard, section pages, accounts, savings and goals, planning tools. Tracking Mode is a later phase; the store already reserves monthly snapshots for it. |

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

## Screens and routes

| Route | Screen |
| --- | --- |
| `/onboarding/:step` | Ten steps: income, home, living, transport, finance, leisure, planned, savings, accounts, summary. Desktop shows a live summary sidebar; mobile shows a step grid and progress bar. |
| `/` | Dashboard, following the design's card layout and the PRD §20 hierarchy |
| `/income`, `/home`, `/living`, `/transport`, `/finance`, `/leisure`, `/planned` | Editable section pages with a stat strip and the same line-item editor as onboarding |
| `/savings` | Goals list, savings split donut, 12-month projection |
| `/accounts` | Accounts list, allocation donut, financial position |
| `/planning` | Can I afford this?, income-change scenario, daily/weekly allowance |
| `/insights` | Subscriptions, true car cost, annualised costs, reducible spending, allocation |
| `/settings` | Name, currency, export/import JSON, reset, load sample data |

Layout: sidebar at ≥ 1024px, bottom navigation below. The "More" tab opens a sheet with the remaining sections.

## Tracking Mode (later)

The store keeps `snapshots: Record<'YYYY-MM', MetricsSnapshot>`. When a prior month snapshot exists, the dashboard renders "vs last month" deltas. Manual actuals per category, planned vs actual and month-over-month diffs build on that without changing the plan model.

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

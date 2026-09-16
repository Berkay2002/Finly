# Finly

A personal finance planner that turns income, bills, savings and balances into one clear picture:
how much your life costs, how much you can safely spend, how much you are saving, and how resilient you are.

Product requirements live in `Personal Finance Planner — Product Requirements & Handoff.md`.
Technical decisions live in `docs/technical-plan.md`. Reference screens are in `design/`.

## Run it

Requires Node 20 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```sh
npm test           # calculation engine tests (Vitest)
npm run typecheck  # strict TypeScript
npm run build      # production build to dist/
```

## How it is put together

- `src/engine/` is a pure TypeScript calculation engine with no React dependency. Every number on the dashboard is a function of the `FinancialPlan`. It is fully unit-tested.
- `src/store/` holds the Zustand store, persisted to `localStorage` under `finly.plan.v1`, plus a sample plan.
- `src/components/` contains the design-system primitives, layout, and the shared line-item editors.
- `src/pages/` contains the onboarding flow and each screen.

All data stays in the browser. Settings offers JSON export and import.

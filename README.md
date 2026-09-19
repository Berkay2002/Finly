# Finly

A personal finance planner that turns income, bills, savings and balances into one clear picture:
how much your life costs, how much you can safely spend, how much you are saving, and how resilient you are.

Product requirements live in `Personal Finance Planner — Product Requirements & Handoff.md`.
Technical decisions live in `docs/technical-plan.md`. Reference screens are in `design/`.

## Run it

Requires Node 24 (see `.node-version`).

```sh
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```sh
npm test           # engine, store and sync tests (Vitest)
npm run typecheck  # strict TypeScript
npm run build      # production build to dist/
```

### Sync backend (optional)

Sync between devices runs on [Convex](https://convex.dev) with no accounts: a 12-word phrase is the identity
and the data is encrypted in the browser before upload. The app runs without it; the Settings card then says
sync is not configured.

```sh
npx convex dev     # once: log in, pick or create a project; writes VITE_CONVEX_URL to .env.local
```

`.env.local` is gitignored. Production runs on Vercel: `vercel.json` builds with
`npx convex deploy --cmd 'npm run build'` when `CONVEX_DEPLOY_KEY` is set, which pushes the functions to the
production deployment and injects its `VITE_CONVEX_URL`; without the key it falls back to a local-only build.
Create the key with `npx convex deployment token create vercel --prod` and store it with
`npx vercel env add CONVEX_DEPLOY_KEY production`.

A live check of the protocol against the deployment in `.env.local` (two devices, conflict, throttle,
tamper, delete) runs with `FINLY_E2E=1 npx vitest run src/sync/__tests__/e2e.test.ts`.

### Company logos (optional)

Expenses tagged as subscriptions show the company's logo: a preview pops up while typing a custom
name in the add-expense sheet, and saved rows carry the logo. Lookups go by brand name to
[Logo.dev](https://www.logo.dev); unknown names get a monogram. The app runs without it and keeps
the regular icons.

Set `VITE_LOGO_DEV_PUBLISHABLE_KEY` in `.env.local` and in Vercel's project environment for
production. The publishable key is safe in client code; it only unlocks logo images, which count
against the free tier's monthly requests. The free tier asks for a visible link back, shown on
the Settings page whenever logos are enabled.

Picking the exact company (instead of the best name guess) needs Logo.dev's Search API: set
`LOGO_DEV_SECRET_KEY` in Vercel's environment and the edit sheet lists matching companies to choose
from, proxied through `/api/logo-search` so the secret key never reaches the browser. Without it the
sheet quietly falls back to a name-only preview. Locally, serverless functions only run under
`vercel dev`, not plain `npm run dev`.

## How it is put together

- `src/engine/` is a pure TypeScript calculation engine with no React dependency. Every number on the dashboard is a function of the `FinancialPlan`. It is fully unit-tested.
- `src/store/` holds the Zustand store, persisted to `localStorage` under `finly.plan.v1`, plus a sample plan. Closed months are frozen there as snapshots with a copy of the plan.
- `src/sync/` and `convex/` implement optional encrypted sync (see `docs/technical-plan.md`, "Tracking Mode").
- `src/components/` contains the design-system primitives, layout, and the shared line-item editors.
- `src/pages/` contains the onboarding flow and each screen.

All data stays in the browser unless sync is turned on, and even then only ciphertext leaves it. Settings offers JSON export and import, including closed months.

<div align="center">

<img src="public/icons/logo-mark.png" alt="Finly" width="96" height="96">

# Finly

**Know what is safe to spend. Every month.**

Finly turns your income, bills, loans, savings and balances into one honest number:
how much you can spend this month without touching what you have set aside.

Made for Swedish households. Everything stays in your browser. MIT licensed.

**[Open Finly](https://finly-ruddy.vercel.app/)**

</div>

## Why Finly

Rent, CSN, an electricity bill that never matches the estimate, a car loan, groceries, the gym.
Budget spreadsheets list all of it and still leave you guessing. Finly builds a small model of your
financial life and answers the questions that actually matter:

- How much does my life really cost each month?
- How much of my income is already committed?
- What is safe to spend right now?
- How much am I saving, and what for?
- How long would my savings last if income stopped?
- Can I afford this car, this trip, this new subscription?

It is not a bank importer and not a spreadsheet. You describe your money once, keep it up to date
in a few minutes a month, and the dashboard does the arithmetic.

## What you get

**One honest number.** Bills, subscriptions, loans and savings are taken off before you see what is
left. The dashboard also shows the usual range, so a tight month is not a surprise.

**Bills that vary.** Electricity, groceries and other costs that swing are planned as a range. When
the real bill arrives you type it in and it replaces the estimate. After a few bills Finly suggests a
better estimate on its own.

**Irregular costs, spread out.** Holidays, insurance, car service and Christmas are turned into a
monthly amount, so your true monthly cost is visible instead of ambushing you twice a year.

**Months ahead.** Step forward to see how a raise, a new loan or a bigger saving goal plays out
before you commit. Save scenarios and compare them.

**Can I afford this?** Try a monthly cost or a one-off purchase. Finly shows which account it comes
from, the lowest point that month, the earliest month it fits without dipping into savings, and how
paying in full, a down payment plus loan, or saving up first compare.

**Savings and goals.** Split what you save into planned spending (a holiday, a repair fund) and
long-term wealth (emergency fund, investments, house deposit). Track each goal against its target
with a 12-month projection.

**Accounts and loans.** See your position across everyday, savings, joint and investment accounts.
Loans get payoff order, interest versus repayment, a debt-free date and a "what if rates change"
view, including the Riksbank outlook.

**Insights.** Where the money goes, your largest costs, subscriptions, the true cost of the car,
annualised spending, what could be cut, and how resilient you are.

**Month history.** Each month is closed automatically and frozen with the plan as it was, so you can
look back a year later and see what things actually cost, with month-over-month comparisons.

**Reminders.** Optional push notifications the day before an irregular cost lands, and a nudge when
a month closes.

## Built for Sweden

- CSN, mortgages with amortisation requirements (amorteringskrav), fixed-rate periods and the
  interest deduction are modelled, not approximated.
- Electricity is planned per price area (elområde) and can follow last month's spot price.
- Groceries are estimated from your household (who eats, lunch at home or out, diet) using
  Konsumentverket's tables, kept current with SCB's food price index.
- Interest rate outlook comes from the Riksbank.
- Available in English and Swedish, with light and dark mode.

## Your data stays yours

Finly has no accounts, no sign-up and no server that reads your plan.

- **Local first.** Your plan lives in your browser. Nothing is uploaded unless you turn something on.
- **Sync without an account.** Turn on sync and Finly gives you a 12-word phrase. That phrase is the
  whole identity, and it encrypts your data on the device before upload. The server stores ciphertext
  it cannot read. Write the phrase down: losing it loses the cloud copy, nothing else.
- **Reminders are encrypted too.** Notification text is encrypted on your device. The server only
  knows when to send, never what a reminder says.
- **Export any time.** Settings gives you a JSON file with your whole plan and every closed month.
  Import it anywhere.

> [!TIP]
> Install Finly to your home screen. Besides the app-like feel, an installed app is exempt from
> Safari's storage clean-up on iOS, and push reminders on iPhone only work when installed.

## Getting started

1. Open [finly-ruddy.vercel.app](https://finly-ruddy.vercel.app/).
2. Pick **Start planning** for a guided session in ten short steps (income, home, living costs,
   transport, finance, leisure, planned spending, savings, accounts, summary). Skip anything that
   does not apply.
3. Or pick **Explore with sample data** to see the full dashboard with an example plan. You can edit
   or reset it later.
4. When prompted, install Finly to your home screen.

Each month, confirm the bills that arrived and glance at the dashboard. That is the whole routine.

## Optional connections

Everything below is off by default and Finly works fully without it.

### Read balances from your bank

Finly can read account balances through [Enable Banking](https://enablebanking.com), using a key that
you create yourself for your own accounts. The key stays in your browser. Finly has no bank access of
its own, and you can forget the connection at any time; your accounts keep their last balance and go
back to manual updates.

> [!NOTE]
> Connecting sends you to your bank and back through BankID. On iOS this lands in Safari rather than
> the installed app, so connect from the browser.

### Company logos

Subscriptions can show the company's logo, looked up by name. Without it you get the regular icons.

## For developers

Finly is a React + TypeScript single-page app built with Vite, with a pure calculation engine, a
Zustand store persisted to `localStorage`, and an optional [Convex](https://convex.dev) backend used
only as an encrypted blob store and push scheduler. It deploys as a static site on Vercel with two
small serverless functions for the Riksbank and SCB data.

Requires Node 24 (see `.node-version`).

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine, store and sync tests
npm run typecheck  # strict TypeScript
npm run build      # production build to dist/
```

Copy `.env.example` to `.env.local`. Every value is optional.

| Environment variable              | Where           | Purpose                                                         |
| --------------------------------- | --------------- | --------------------------------------------------------------- |
| `VITE_CONVEX_URL`                 | `.env.local`    | Sync and reminders. Written by `npx convex dev`.                |
| `VITE_VAPID_PUBLIC_KEY`           | `.env.local`    | Push reminders. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` go in Convex env. |
| `CONVEX_DEPLOY_KEY`               | Vercel          | Deploys Convex functions on build.                              |
| `VITE_LOGO_DEV_PUBLISHABLE_KEY`   | `.env.local`    | Company logos via [Logo.dev](https://www.logo.dev).             |
| `LOGO_DEV_SECRET_KEY`             | Vercel          | Exact company picker via `/api/logo-search`.                    |

Layout of the source:

- `src/engine/` pure TypeScript calculations, no React, fully unit-tested
- `src/store/` Zustand store, month closing, JSON export and import
- `src/sync/` and `convex/` encrypted sync and push reminders
- `src/bank/` Enable Banking connection
- `src/pages/` onboarding and every screen
- `docs/` product requirements, technical plan and the Swedish tax, loan and savings models (see `docs/README.md`)

A live check of the sync protocol against the deployment in `.env.local` runs with
`FINLY_E2E=1 npx vitest run src/sync/__tests__/e2e.test.ts`.

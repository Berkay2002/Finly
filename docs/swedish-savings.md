# Swedish savings: how Finly models ISK, KF, AF and savings accounts

The same money is taxed differently depending on the account it sits in. Finly records the account type
(the *wrapper*) on each account and works out the year's tax, the return after tax, and the tax still to pay.
The code is `src/engine/tax/capital.ts`; the figures below are checked against the sources at the end. Update
the constants marked *yearly* in December. One person is assumed: every ISK and KF shares one tax-free level.

## Account types

| Kind | Wrapper | Tax | Paid |
| --- | --- | --- | --- |
| `isk` | ISK | schablonskatt on the kapitalunderlag above the tax-free level | with the final tax (slutskatt) the spring after |
| `kf` | KF | schablonskatt, same rate and tax-free level | the insurer takes it on the whole underlag; the tax-free part comes back in the tax return |
| `af` | AF (depå) | 30 % of gains when sold and of dividends; funds held on 1 Jan: 0.4 % of the value counts as income (0.12 % tax) | dividends withheld at payout; fund tax with the final tax |
| `savings`, `emergency`, … | cash | 30 % of interest | withheld by the bank |
| `investment` | unknown | not counted | saved before the wrappers existed; the app asks the user to pick one |

## Schablonskatt (ISK and KF)

- **Schablonränta** = statslåneränta on 30 November the year before + 1 percentage point, at least 1.25 %.
  2026: 2.55 % + 1 = 3.55 %, so the tax is 1.065 % of the taxed underlag.
- **Tax-free level** (skattefri grundnivå, *yearly*): 150 000 kr in 2025, 300 000 kr from 2026, per person across all ISK
  and KF. Finly spreads it over the accounts in proportion to their underlag.
- **ISK underlag** = (value on 1 Jan + 1 Apr + 1 Jul + 1 Oct + deposits during the year) / 4. Transfers of securities in count as deposits.
- **KF underlag** = value on 1 Jan + premiums paid during the year, those from 1 July at half.
- Gains, dividends and interest inside are not taxed; losses cannot be deducted.

**Quarter values.** A quarter that has started reads the balance recorded for the month before (`balances['2026-03']` for
1 April), or the closest earlier one, else today's balance. Quarters ahead grow today's balance by the account's expected
return and deposits. **Deposits** are the monthly contributions of the goals linked to the account, or the account's own
`monthlyDeposit` when none is linked, times twelve.

**Rate for a year not yet known.** `CAPITAL_TAX_YEARS` holds decided years. After that the 30 November rate comes from
the live statslåneränta (`RateOutlook.govBondRate.nov30`); before 30 November, today's rate is used and the year is
flagged as an estimate.

## AF

- 30 % of the gain (price − anskaffningsvärde, genomsnittsmetoden) when sold. Finly shows the tax if everything were sold
  today from the entered `costBasis`. Realized sales are not tracked.
- Losses on listed shares and funds offset gains on the same in full; what is left counts at 70 % against other capital
  income (a 21 % reduction).
- Funds: 0.4 % of the fund value on 1 January is taxed as income (`fundShare` sets how much of the account is funds).
- Dividends: 30 %, withheld (`dividendYield` on the shares part).
- Moving holdings from AF to ISK or KF counts as a sale.

## Where it shows up

| Figure | How |
| --- | --- |
| `metrics.capitalTax` | per-account underlag, tax, withheld, slutskatt, tax if sold, return after tax |
| Accounts page | "Tax on savings" strip with the tax-free level used; details sheet with the next year at today's statslåneränta |
| Net worth after tax | net worth − AF tax if sold − this year's tax not yet withheld |
| Upcoming / month outlook | "Tax on savings {year}" on 12 May the year after (ISK + AF fund tax − KF refund) |
| Goals | a goal linked to an account compounds at that account's return after tax (`goalProgress`, `savingsProjection`) |
| Insights | suggestions: pick a wrapper, cash under the tax-free level, AF above the break-even, over the deposit guarantee |

**Return after tax.** ISK/KF: expected return − schablonränta × 30 % × the taxed share of the underlag. AF: expected return
− fund and dividend tax (gains are only taxed when sold). Cash: interest × 70 %.

**ISK or AF.** With the gain taxed at 30 % on sale and ISK taxed at 30 % of the schablonränta on the value, ISK taxes less when
the expected return is above the schablonränta (3.55 % in 2026), and nothing at all under the tax-free level.

**Final tax.** Tax above 30 000 kr on the final tax gathers interest from 13 February unless paid in by 12 February. The
due date is usually 12 May when the decision comes in April.

**Deposit guarantee** (insättningsgaranti): 1 150 000 kr per person and bank from 2026 (was 1 050 000 kr), cash only.

## Statslåneränta

Riksgälden sets it each Thursday; it applies from Friday. `api/rates.ts` reads their CSV
(`statslanerantor.csv`, newest first, comma decimals) and returns today's rate and the rate in force on 30 November each
year (the row dated 24–30 November). A Riksgälden failure leaves the Riksbank data intact. The app ships a copy in
`BUNDLED_OUTLOOK.govBondRate`.

## Yearly checklist

1. After 30 November: add next year to `CAPITAL_TAX_YEARS` with the rate on 30 November, and update `BUNDLED_OUTLOOK.govBondRate`.
2. Check the budget for a change to the tax-free level.
3. Check the deposit guarantee amount.
4. Run `npm test` (`capital-tax.test.ts`).

## Sources

- Skatteverket, Investeringssparkonto (ISK): schablonintäkt, kapitalunderlag, skattefri grundnivå.
- Skatteverket, Avkastningsskatt; insurers' KF pages (Nordea, Swedbank) for the 2026 tax-free level and refund.
- Riksgälden, Statslåneräntan per vecka; 30 Nov 2023 2.62 %, 2024 1.96 %, 2025 2.55 %.
- Avanza, "Så blir skatten på ISK och KF 2026" (300 000 kr, 3.55 %, 1.065 %).
- Skatteverket, Ränta på skattekontot (kvarskatt above 30 000 kr, 12 February).
- Riksgälden, "Insättningsgarantins maxbelopp ändras till 1 150 000 kronor" (30 Oct 2025).

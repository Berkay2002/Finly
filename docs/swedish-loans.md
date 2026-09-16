# Swedish loans: how Finly models debt

Loans are not spending. Rent is gone once paid; a loan payment is partly **interest** (the real cost of
borrowing) and partly **repayment** (which lowers what you owe and raises net worth). Finly keeps loans in
their own list, `plan.debts`, separate from expenses. The code is `src/engine/debts.ts`; the figures below
are checked against the sources at the end. Update the constants marked *yearly* each January.

## Where loans show up

| Figure | How loans count |
| --- | --- |
| Normal monthly cost (`lifestyleCost`) | spending + every loan payment (monthly equivalent) |
| Essential cost | essential spending + every loan payment. Minimum repayments cannot be skipped |
| Committed (Insights) | committed spending + loan payments |
| Allocation | lifestyle excludes the repayment part; repayment is its own "Paying down loans" share |
| Net worth | assets − Σ loan balances. Snapshots store `totalDebt`, `netWorth`, `debtPayments`, `byDebt` |
| Upcoming / month outlook | quarterly and yearly loan payments (CSN) appear on their due dates |
| Safe to spend | smoothed like every other irregular cost: a quarterly CSN bill counts as a third per month, not the full amount in the month it is due |
| True car cost | car-tagged expenses + car loan payments |

`spendingCost` is the old figure without loans; `expenses.*` stays spending-only.

## Kinds and their rules

Payoff priority, from pay first to pay last, is the interest rate **after ränteavdrag**, with CSN always last.
Within 0.25 percentage points the tie goes to the less secure loan: credit card → personal loan → unsecured
other/car → secured other/car → mortgage.

### CSN (`csn`)

- **Rate** (*yearly*): 2.135 % in 2026 (`CSN_RATE_2026`). The government sets it each year as the average
  statslåneränta over the three previous years, reduced by 30 %. No ränteavdrag on top of that.
- **Annuitetslån** (loans from July 2001, `csnType: 'annuity'`): CSN sets an årsbelopp that rises about 2 %
  a year (`CSN_STEP_UP`); the payoff simulation steps the payment up every 12 months. Lowest årsbelopp 2026:
  8,880 kr (*yearly*). Loans from 2001–2021 must be repaid by 60 and are written off at 68; loans from 2022
  by 64 and written off at 72.
- **Studielån** (1989 to June 2001, `csnType: 'income_based'`): 4 % of the income from two years earlier.
- Paid **four times a year** by default, due the last banking day of February, May, August and November, or
  monthly on request. Finly uses the last calendar day (`nextCsnDueDate`).
- **Nedsättning**: payments can be lowered to 5 % of income (7 % from age 50) when income falls. The runway
  figure `essentialRunwayCsnReducedMonths` shows essentials with CSN at zero, the case when income stops.
- Whatever is left is **written off at death**. Not modelled in payoff.

### Mortgage (`mortgage`)

- **Straight amortisation**: a fixed amortering per month plus interest on the balance. With balance, rate
  and amortering entered, the payment is computed, not typed.
- **Amorteringskrav** (from 1 April 2026, the extra 1 % above 4.5× income is gone): above 70 % loan-to-value
  2 % of the debt a year, 50–70 % 1 %, at or below 50 % nothing. Bolånetak 90 %. Loans from before June 2016
  can be exempt. `amortizationRequirement` adds every mortgage part together against the highest home value
  entered.
- Always secured, so it gives **ränteavdrag**.

### Car loan (`car`)

Secured (billån through the dealer, the car is security) keeps ränteavdrag; unsecured (a blancolån used for a
car) does not. New car loans default to secured. Fixed monthly payment (annuity).

### Personal loan, credit card (`personal`, `credit_card`)

Always unsecured, so no ränteavdrag from 2026. Fixed monthly payment.

### Other (`other`)

Secured or not, as the user says.

## Ränteavdrag (skattereduktion för ränteutgifter)

- From income year 2026 only interest on loans **with security** qualifies (mortgage, secured car loan,
  secured other). Unsecured loans and CSN do not.
- 30 % of up to 100,000 kr of interest a year, 21 % above (`interestTaxReduction`).
- `effectiveRate` uses the 30 % band for ordering loans.
- `metrics.debt.taxReduction` is the reduction per month on known deductible interest. It is shown next to
  interest but **not** added to income: most people get it back through the preliminary tax or the yearly
  settlement, and Finly budgets on the net pay that arrives.

## Monthly flow and payoff

- `debtFlow(d)` gives `{ monthly, interest, principal }`. Interest is balance × rate ÷ 12; the rest of the
  payment is repayment. Without balance and rate the split is `null` and the payment still counts in full.
- `debtPayoff(d, now)` runs the loan month by month at today's rate (capped at 100 years) and returns months,
  total interest left and the debt-free date. `Infinity` months means the payment does not cover the interest.

## Plans from before loans had their own model

`migrateLegacyDebts` runs when a plan is loaded from storage (persist v3), imported, or replaced by sync.
Expenses with the old loan suggestions (`student_loan` → CSN, `mortgage` + `mortgage_interest` → one mortgage
with that amortering, `car_finance` → secured car loan, `personal_loan`, `credit_card`, `other_debt`) or the
`debt` tag become loans with the same payment, so monthly totals do not change. Balance and rate are left for
the user to fill in. Loan ids are `debt_<expense id>`, so two devices migrating the same plan agree. Closed
months keep their frozen plans as they were.

## Assumptions and limits

- **One home.** The amortisation requirement uses the highest home value across mortgage parts.
- **The requirement uses today's balance and value.** Banks use the value at purchase or the latest
  valuation.
- **The 100,000 kr ränteavdrag limit is per person.** A couple sharing a mortgage has two limits; Finly applies
  one to the whole household, so above 100,000 kr of interest it slightly understates the reduction.
- **Rates stay where they are.** Payoff dates and interest left assume today's rate for the whole life of the
  loan. A rörlig bolåneränta follows the Riksbank policy rate; the CSN rate follows the three-year average
  statslåneränta with a lag.
- **Typical rates** (`TYPICAL_RATE`) only place a loan whose rate is missing in the payoff order. They are never
  shown.

## Sources (checked September 2026)

- CSN: [ränta och avgifter](https://www.csn.se/betala-tillbaka/betala-tillbaka-studielan/ranta-och-avgifter.html),
  [fem vanliga missuppfattningar om CSN-räntan](https://www.csn.se/om-csn/aktuellt/nyhetsflode/2025-08-15-fem-vanliga-missuppfattningar-om-csn-rantan.html),
  plus csn.se pages on avskrivning, nedsättning, how long you pay and loans from 1989–2001.
- Ränteavdrag from 2026: guides from Länsförsäkringar, Swedbank, Handelsbanken and SEB.
- Amorteringskrav from 1 April 2026: regeringen.se and Handelsbanken.

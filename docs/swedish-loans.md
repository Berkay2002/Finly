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
other/car → secured other/car → mortgage. Between two mortgage parts, a rörlig del comes before a bunden one
whatever the rates, because paying a bunden del early can cost ränteskillnadsersättning.

### CSN (`csn`)

- **Rate** (*yearly*): 2.135 % in 2026 (`CSN_RATES` in `rates.ts`). Set each December for
  the next year: a base rate (the state's average borrowing cost on statsobligationer and statsskuldväxlar,
  except three-month bills, from November three years back to October that year; 1.736 % for 2026) plus a
  markup for credit losses (0.399 %), subsidised by 30 % for the borrower. No ränteavdrag on top of that.
  The loan editor offers the current year's rate (an estimate from `csnRateForYear` when that year is not
  in the table yet) and, when the next payment falls in a later year, the rate expected then. The entered
  rate is saved with `rateYear` and only used for that year.
- **Repayment not started**: a next payment due more than one period away (over three months for quarterly)
  means repayment starts then (`repaymentStart`). The payoff simulation takes no payments before that
  quarter and adds the interest to the balance; the editor shows about how much (`interestBeforeRepayment`).
- **First årsbelopp** (`csnFirstYearly`, studiestödslagen 4 kap. 1, 3–4, 8–10 §§): repayment starts in January,
  at least six months after the last studiemedel. The debt then (the year's unpaid interest is added at year
  end) is spread over 25 years, or to the end of the year you turn 64 (60 if every loan is from July 2001 to
  2021), as payments rising 2 % a year: `debt × (r − g) / (1 − ((1 + g) / (1 + r))^n)`, g = 2 %. Below 15 % of
  prisbasbelopp it is raised to that and the time shortens. CSN does not publish its formula; this gives
  15 240 kr for its 2026 example (15 266 kr). The birth year is the plan's `birthYear`, asked (optionally)
  in onboarding and Settings, and in the CSN loan sheet when missing.
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
- **Rörlig or bunden** (`rateType`, per mortgage part). Rörlig (three-month fixation) follows the styrränta
  within weeks, and extra amortering is free at any time. Bunden keeps its rate until the
  **villkorsändringsdag** (`rateFixedUntil`); repaying early before then can cost **ränteskillnadsersättning**,
  so extra money goes to rörliga delar first and to a bunden del on its villkorsändringsdag. Mortgages saved
  before the choice existed count as bunden when they have a date and rörlig otherwise.

### Car loan (`car`)

Secured (billån through the dealer, the car is security) keeps ränteavdrag; unsecured (a blancolån used for a
car) does not. New car loans default to secured. Fixed monthly payment (annuity).

### Net worth

Loans count against net worth, and what they bought counts for it (`loanAssets`): the home value entered on
the mortgage (once, however many parts), and `assetValue` on car loans and secured other loans. CSN has
nothing behind it, so Home and Accounts also show net worth without CSN: it is cheap, repaid over many
years, lowered when income drops and written off at death.

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
- `debtPayoff(d, now, rateAt?)` runs the loan month by month (capped at 100 years) and returns months, total
  interest left and the debt-free date. `Infinity` months means the payment does not cover the interest.
  Without `rateAt` it uses today's rate; with one (`forecastRates`, see "Rates ahead") the rate can change
  each month.
- `debtSchedule(d, now, months, rateAt?)` gives the same run as monthly rows (rate, payment, interest,
  repayment, balance), zero once the loan is paid off. Loans without balance or rate repeat today's payment.
- Everywhere except the "If rates change" card and the forecast line in the loan sheet, figures use today's
  rate.

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
- **The main figures keep today's rate.** Payoff dates, interest left and monthly costs assume today's rate.
  The forecast in "Rates ahead" is shown next to them, never instead of them.
- **Typical rates** (`TYPICAL_RATE`) only place a loan whose rate is missing in the payoff order. They are never
  shown.

## Rates ahead

`src/engine/rates.ts`, shown on the Loans page ("If rates change") and in the loan sheet. It is an estimate:
the Riksbank changes its forecast at every policy meeting and has often been wrong.

### Data: `RateOutlook`

- **Policy rate** today and its monthly average back to November four years ago (Riksbank SWEA, series
  `SECBREPOEFF`).
- **Forecast path**: the latest policy round's forecast of the policy rate, as quarterly averages (Riksbank
  monetary policy data, series `SEQRATENAYNA`).
- Fetched by `GET /api/rates` (a Vercel Function, see [technical-plan.md](technical-plan.md#server-functions)),
  cached a day on the CDN and a day in the browser. `BUNDLED_OUTLOOK` is the copy shipped with the app. It is
  used offline, before the fetch returns, and when the Riksbank is down.

### The policy rate over time (`policyRateAt`)

Past months use the monthly average; this month uses today's rate. Months ahead use today's rate moved by the
forecast's change from this quarter to that quarter, so the path starts from where the rate really is. After
the last forecast quarter the rate stays flat.

### Each loan (`rateAt`, `forecastRates`)

| Loan | Rate in a future month |
| --- | --- |
| Rörlig bolån | your rate + (policy rate then − policy rate now) |
| Bunden bolån | your rate until the villkorsändringsdag, then policy rate then + rörlig margin |
| CSN | your rate in `rateYear` (the year you entered it for), CSN's decided or projected rate in other years: CSN charges everyone the same |
| Car, personal, credit card, other | your rate (lenders price these only loosely against the market) |

The **rörlig margin** is your own rörliga delar's rate over the policy rate, weighted by balance. Without a
rörlig del it is SCB's average rate on new rörliga bolån over that month's policy rate
(`MORTGAGE_VARIABLE_AVERAGE`: 2.74 % in July 2026, a margin of about 1 percentage point).

### CSN's rate for a coming year (`csnRateForYear`)

The real base is the state's borrowing cost, which Finly does not have. The policy rate stands in for it, but
only for the **change**:

    rate(year) = last decided rate
               + 0.7 × (average policy rate over the year's window − average over the last decided year's window)

The window runs from November four years before to October the year before (2027: Nov 2023 to Oct 2026).
Anchoring on the last decided rate cancels most of the gap between the policy rate and bond yields, but not
all of it. Predicting each of 2024, 2025 and 2026 from the year before came out 0.11, 0.14 and 0.35
percentage points too high, using the policy rate from 2019 on. Treat it as a direction, not a figure. With the bundled
data: 2027 about 1.81 %, 2028 1.37 %, 2029 1.32 %, 2030 1.41 %. The credit-loss markup is assumed unchanged.

### Warnings and sensitivity

- **A bunden del resets** (`fixedRateResets`): within three months, or passed in the last three months (the
  sheet looks a year ahead). Shows the expected new rate and the monthly change at today's balance, before and
  after ränteavdrag. A passed date asks for the real rate from the bank.
- **+1 percentage point** (`rateShock`): the mortgage balance that can move within a year (rörliga delar,
  bundna ending within a year, bundna without a date) × 1 % ÷ 12, and × 0.7 after ränteavdrag. CSN and other
  loans are left out: CSN moves a year or more later, other loans only loosely.

### Keeping it current

| What | When | Where |
| --- | --- | --- |
| `CSN_RATES` | each December, when CSN publishes next year's rate | `rates.ts` |
| `MORTGAGE_VARIABLE_AVERAGE` | a few times a year (SCB publishes monthly) | `rates.ts` |
| `BUNDLED_OUTLOOK` | after each monetary policy report (four a year) | `rates.ts` |

The live outlook updates itself; the bundled copy only matters when the function cannot reach the Riksbank.

## Sources (checked September 2026)

- CSN: [ränta och avgifter](https://www.csn.se/betala-tillbaka/betala-tillbaka-studielan/ranta-och-avgifter.html),
  [fem vanliga missuppfattningar om CSN-räntan](https://www.csn.se/om-csn/aktuellt/nyhetsflode/2025-08-15-fem-vanliga-missuppfattningar-om-csn-rantan.html),
  plus csn.se pages on avskrivning, nedsättning, how long you pay and loans from 1989–2001.
- Ränteavdrag from 2026: guides from Länsförsäkringar, Swedbank, Handelsbanken and SEB.
- Amorteringskrav from 1 April 2026: regeringen.se and Handelsbanken.
- CSN rate components: csn.se on the 2026 rate (base 1.736 %, markup 0.399 %) and CSN's decisions for 2023
  and 2024.
- Riksbank: [API portal](https://developer.api.riksbank.se/), SWEA (policy rate `SECBREPOEFF`) and monetary
  policy data (forecast `SEQRATENAYNA`, policy round 2026:2, 17 June 2026).
- SCB: interest rates on new mortgages to households, July 2026.
- Vercel: [Hobby plan limits](https://vercel.com/docs/plans/hobby) and
  [Functions usage and pricing](https://vercel.com/docs/functions/usage-and-pricing).

# Swedish salary tax: how Finly turns gross into net

Finly budgets on **net** income. For Swedish users a salary can also be entered **before tax**, and the
engine works out the net the same way the employer's payroll does. This document explains the model,
why mid-year onboarding is not a problem, and what to update each year.

## The model: monthly withholding, not the annual tax bill

Swedish employers deduct preliminary tax every month from Skatteverket's **skattetabeller**. A table row
is built like this (SKV 433, "Teknisk beskrivning"):

1. Annualise the monthly salary: `gross × 12` (the top of the 100/200 kr table interval).
2. Compute a full year's tax on that figure with **grundavdrag** and **jobbskatteavdrag** applied in full,
   plus state tax above the skiktgräns, allmän pensionsavgift and its offsetting reduction,
   skattereduktion för förvärvsinkomst, begravningsavgift, kyrkoavgift and public service-avgift.
3. Divide by 12.

Nothing carries from month to month. Grundavdrag and jobbskatteavdrag are not "used up": each month
gets one twelfth of the full-year entitlement, assuming the same salary all year. That is why:

- **Onboarding in August gives the same net as onboarding in January.** The payslip is the same.
- **We do not need to know whether the user worked earlier in the year.** That only affects the
  annual settlement (deklaration) the following year, where any over- or under-withholding comes back
  as a refund or kvarskatt. Finly can estimate that later as an optional one-off item; it is not needed
  to get the monthly budget right.

The engine reproduces every row of the official 2026 monthly tables 29–42 (columns 1 and 3) to within
1 kr; see `src/engine/__tests__/tax-sweden.test.ts`.

## What the user tells us

| Input | Why |
| --- | --- |
| Kommun | Sets the kommun + region rate (roughly 29–35 %) and the burial fee exception for Stockholm/Tranås. |
| Member of Svenska kyrkan | Adds kyrkoavgift (national average used unless a parish rate is given). |
| 66 or older at the start of the year | Förhöjt grundavdrag and a different jobbskatteavdrag (table column 3). |

The computed net is a **prefill**. The user can overwrite it to match a real payslip (jämkning,
tjänstepension deductions, benefits and second jobs all move the number) and Finly keeps the override
until the gross or the profile changes.

## What is deliberately out of scope

- **Bonuses and other one-off payments** use the flat engångsbelopp bands, not the monthly table
  (`oneOffWithholdingRate`). Do not run a bonus through the monthly calculation.
- **Second employers** withhold a flat 30 %. A side job entered as gross should say so.
- **RUT, ROT, interest deductions** reduce the annual bill and never show on a payslip.
- **Pension income** (column 2) is not modelled; enter pensions net.

## Files

| File | Role |
| --- | --- |
| `src/engine/tax/years.ts` | One `SwedishTaxYear` object per income year: base amounts, thresholds, every piecewise coefficient, fee rates. |
| `src/engine/tax/kommuner-<year>.ts` | Generated kommun rate list from SCB. |
| `src/engine/tax/kommuner.ts` | Year index for the kommun lists. |
| `src/engine/tax/sweden.ts` | The mechanics: order of reductions, caps, rounding. Year-independent. |
| `src/engine/__tests__/fixtures/skattetabell-<year>.ts` | Sampled rows from the official tables for verification. |
| `scripts/fetch-kommuner.mjs` | Regenerates a kommun list from SCB's API. |

## Yearly update (December)

Skatteverket publishes next year's rules in early December. To add a year:

1. `npm run tax:kommuner -- <year>` and register the new file in `kommuner.ts`.
2. Add a `SWEDEN_<year>` object in `years.ts`. Sources:
   - "Teknisk beskrivning SKV 433" for the grundavdrag, förhöjt grundavdrag, jobbskatteavdrag
     schedules, fee points, pension fee rounding, and the engångsbelopp bands.
   - "Belopp och procent inkomstår <year>" for prisbasbelopp, inkomstbasbelopp, skiktgräns, public
     service cap, begravningsavgift.
   - Svenska kyrkan / SCB for the average kyrkoavgift.
3. Pull sampled rows from Skatteverket's open table data (dataset
   `88320397-5c32-4c16-ae79-d36d95b17b95`, `tabellnr`, `år`, `antal dgr=30B`) into a new fixture and
   point the table test at it.
4. Run `npm test`.

Until a year is added, `resolveTaxYear()` falls back to the newest known year and
`isTaxYearStale()` returns true, which the income editor surfaces as a note.

## Sources

- Skatteverket, Teknisk beskrivning SKV 433 utgåva 36 (2025-12-10), income year 2026.
- Skatteverket, Belopp och procent inkomstår 2026.
- Skatteverket open data, Skattetabeller (monthly, 2026).
- SCB, Kommunalskatter 2000–2026 (table OE0101).

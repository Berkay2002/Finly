# Personal Finance Planner  
## Product Requirements Document / Product Handoff

## 1. Product Summary

The product is a personal finance planning and monitoring tool designed to help a user understand:

- How much money comes in
- Where that money goes
- How much their lifestyle actually costs
- How much of their spending is fixed versus flexible
- How much they can safely spend
- How much they are saving
- What they are saving for
- How financially resilient they are
- What upcoming costs may affect them
- How potential purchases or financial decisions would affect their finances
- How much money they currently hold in bank accounts and savings

The product should not behave like a traditional budgeting spreadsheet.

The goal is to create a financial model of the user's life and translate that model into a clear, visual dashboard.

The user should be able to answer questions such as:

> How much does my life actually cost?

> How much money can I safely spend?

> How much of my income is already committed?

> How much am I saving?

> How much money do I currently have?

> How long could my savings support me?

> Can I afford another recurring expense?

The product has two primary stages:

1. **Initial financial planning / onboarding**
2. **Ongoing financial dashboard**

A summary/review step connects the two.

---

# 2. Product Principles

## 2.1 Understand the user's financial life before showing analytics

The first experience should be a guided financial planning session.

The user gradually describes their income, expenses, savings, balances, financial obligations and goals.

The product then turns this information into a structured financial picture.

---

## 2.2 The dashboard should answer questions

The dashboard should not exist simply to show charts.

Every primary metric or visualization should answer a useful financial question.

For example:

- How much can I spend?
- What costs me the most?
- How much am I saving?
- What happens if I buy a car?
- How much money do I currently have?
- How long would my savings last?

---

## 2.3 Monthly budgets should account for non-monthly costs

The product should avoid making irregular costs invisible.

For example:

- 12,000 SEK annual holiday budget → 1,000 SEK/month
- 6,000 SEK Christmas spending → 500 SEK/month
- 8,000 SEK annual car servicing → approximately 667 SEK/month
- 3,600 SEK annual insurance → 300 SEK/month

The dashboard should therefore represent the user's **true monthly cost**, not merely expenses that happen to be billed monthly.

---

## 2.4 Saving is not simply another expense

The product should distinguish between:

### Current consumption
Money used to maintain the user's current life.

### Planned future spending
Money being set aside for something expected to eventually be purchased or consumed.

Examples:

- Holiday fund
- Car repair fund
- Christmas fund
- Electronics fund

### Long-term wealth
Money intended primarily for longer-term financial security or growth.

Examples:

- Emergency savings
- Investments
- House deposit
- Long-term savings
- Pension savings

---

## 2.5 Reliable and unreliable income should be distinguishable

Not all income should be treated equally.

For example:

**Reliable**
- Salary
- Pension
- Stable benefits

**Variable**
- Self-employment
- Freelancing
- Commission
- Bonuses
- Overtime
- Irregular side income

The product should allow the user to understand whether their normal lifestyle depends on variable income.

---

# 3. Primary Product Journey

The core journey consists of three stages.

## Stage 1 — Understand My Finances

A guided onboarding flow in which the user describes their financial life.

## Stage 2 — Financial Summary

The product presents its interpretation of the user's finances.

The user can review and correct information before continuing.

## Stage 3 — Dashboard

The user receives a persistent financial overview containing the most important metrics, visualizations, projections and planning tools.

---

# 4. Initial Onboarding

The onboarding should feel like a guided financial planning session rather than a large form.

Users should move through logical sections one at a time.

Suggested structure:

1. Income
2. Home
3. Living costs
4. Transport
5. Finance and insurance
6. Lifestyle and leisure
7. Irregular and planned spending
8. Savings and investments
9. Current money and account balances
10. Financial goals
11. Summary

The user should always be able to add custom entries.

Not every user needs every category.

Irrelevant sections should be skippable.

---

# 5. Income

The product should understand the user's incoming money.

Examples include:

- Salary after tax
- Gross salary where relevant
- Self-employment income
- Freelancing
- Side jobs
- Overtime
- Bonuses
- Commission
- Pension
- Benefits
- Tax credits
- Government payments
- Investment income
- Other recurring income
- Other irregular income

Each income source should be able to represent concepts such as:

- Amount
- Frequency
- Reliability
- Whether the income should be included in the user's baseline budget

Example:

**Salary**
31,500 SEK/month  
Reliable

**Self-employment**
Average 5,000 SEK/month  
Variable

The product should therefore be able to distinguish:

**Reliable income:** 31,500 SEK  
**Average additional income:** 5,000 SEK  
**Average total income:** 36,500 SEK

---

# 6. Home

Potential home-related expenses include:

- Rent
- Mortgage payment
- Mortgage interest
- Home insurance
- Property charges
- Electricity
- Gas
- Heating
- Water
- Internet
- Waste collection
- Parking associated with the home
- Maintenance
- Housing association fees
- Other housing costs

The user should be able to indicate when utilities or services are already included in rent or another payment.

---

# 7. Living Costs

Examples:

### Food and drink
- Groceries
- Restaurants
- Takeaway
- Cafés
- Work lunches
- Alcohol at home
- Other food spending

### Household
- Cleaning products
- Household supplies
- Furniture
- Small household purchases

### Clothing
- Clothes
- Shoes
- Accessories

### Health and personal care
- Haircuts
- Dental care
- Prescription medicine
- Non-prescription medicine
- Personal care
- Beauty products
- Other health costs

### Work-related personal expenses
- Union fees
- Professional memberships
- Work clothing
- Other recurring work-related costs

---

# 8. Transport

Transport should include both ownership and usage costs.

## Car

Potential entries include:

- Car financing
- Loan repayments
- Lease payment
- Fuel
- Electric charging
- Insurance
- Vehicle tax
- Maintenance
- Servicing
- Repairs
- Tyres
- Parking
- Congestion charges
- Tolls
- Road charges
- Car washing
- Other vehicle expenses

The product should eventually be able to calculate a **true monthly car cost**.

Example:

Car finance — 3,200 SEK  
Fuel — 1,200 SEK  
Insurance — 800 SEK  
Tax — 250 SEK  
Maintenance provision — 500 SEK  
Parking — 600 SEK

**True car cost: 6,550 SEK/month**

---

## Public transport

Examples:

- Bus
- Tram
- Metro
- Train
- Monthly travel card
- Taxi
- Ride sharing

---

## Other travel

Examples:

- Flights
- Ferry
- Long-distance rail
- Rental cars

Holiday travel may alternatively be treated as planned/irregular spending depending on context.

---

# 9. Finance and Insurance

Examples include:

- Personal loans
- Credit cards
- Student loans
- Other debt repayments
- Banking fees
- Life insurance
- Health insurance
- Dental insurance
- Income insurance
- Loan insurance
- Other financial commitments

The product should differentiate between debt repayment and ordinary consumption.

---

# 10. Lifestyle and Leisure

This category may be broad and customizable.

Examples:

### Entertainment
- Cinema
- Events
- Concerts
- Nights out

### Media and subscriptions
- Streaming services
- Music subscriptions
- Gaming subscriptions
- Software subscriptions
- News subscriptions
- Other digital services

### Hobbies
- Gaming
- Books
- Photography
- Sports
- Collecting
- Creative hobbies
- Other hobbies

### Health and fitness
- Gym membership
- Sports membership
- Training equipment
- Fitness classes

### Other leisure
- Lottery
- Games
- Films
- Social spending
- Miscellaneous leisure

---

# 11. Irregular and Planned Spending

This section should capture costs that do not necessarily occur every month.

Examples:

- Holidays
- Flights
- Christmas
- Birthdays
- Gifts
- Electronics
- Furniture
- Car service
- Annual subscriptions
- Annual insurance
- Clothing purchases
- Home purchases
- Events
- Large one-off purchases

The user should be able to represent either:

- Expected annual total
- Specific upcoming expense
- Recurring expense with a longer interval

The system should convert these into a useful monthly equivalent where appropriate.

---

# 12. Savings and Investments

The onboarding should capture both existing savings and ongoing contributions.

Possible types include:

### Emergency savings
Cash intended for unexpected situations.

### General savings
Money without a specific immediate purpose.

### Investments
Examples:

- Funds
- Shares
- Investment accounts
- Other investment assets

### Goal-based savings
Examples:

- House deposit
- Car
- Holiday
- Electronics
- Wedding
- Education
- Moving
- Other major purchase

### Pension / retirement savings

The user should be able to specify:

- Current balance
- Monthly contribution
- Target amount if applicable
- Target date if applicable

---

# 13. Current Money and Bank Accounts

The product should capture the user's current financial position, not only monthly income and expenses.

The user should be able to add accounts such as:

- Current account
- Salary account
- Savings account
- Emergency savings account
- Joint account
- Cash savings
- Investment account
- Other financial account

For each relevant account, the user should be able to specify its current balance.

Example:

Salary account — 18,500 SEK  
Savings account — 72,000 SEK  
Emergency fund — 40,000 SEK  
Investment account — 110,000 SEK

The dashboard should then be able to show values such as:

**Cash in bank:** 90,500 SEK

**Dedicated emergency savings:** 40,000 SEK

**Investments:** 110,000 SEK

**Total tracked financial assets:** 200,500 SEK

Care should be taken not to treat all of these balances as freely spendable.

For example, emergency savings and investment balances should remain distinguishable from everyday spending money.

---

# 14. Expense Classification

Expenses should not only belong to categories.

They should also be understood according to their financial characteristics.

Useful classifications include:

## Fixed vs variable

**Fixed**
- Rent
- Loan payment
- Insurance
- Subscription

**Variable**
- Groceries
- Restaurants
- Fuel
- Shopping

---

## Essential vs optional

**Essential**
- Housing
- Basic food
- Required transportation
- Insurance
- Debt minimums

**Optional**
- Entertainment
- Restaurants
- Premium subscriptions
- Hobby spending

Some entries may require user judgement.

---

## Committed vs flexible

**Committed**
Costs that are difficult to change in the short term.

**Flexible**
Costs the user could realistically adjust.

This classification will power several dashboard metrics.

---

# 15. Core Financial Numbers

The product should calculate several important financial concepts.

## Essential Cost

The minimum amount required each month to meet essential obligations.

Examples:

- Housing
- Basic groceries
- Required transportation
- Insurance
- Minimum debt repayments
- Essential utilities

This answers:

> What is the minimum amount I need every month?

---

## Lifestyle Cost

The expected cost of maintaining the user's normal current lifestyle.

This includes essential expenses plus the user's usual discretionary spending.

This answers:

> What does my normal life actually cost?

---

## Planned Cost

Lifestyle cost plus intended savings and financial goals.

This answers:

> How much income do I need to live as planned and still achieve my goals?

---

# 16. Summary Step

After onboarding, the user should receive a review screen before entering the dashboard.

The summary should communicate:

### Income
Reliable income  
Variable income  
Average total income

### Expenses
Home  
Living  
Transport  
Finance  
Lifestyle  
Irregular-cost monthly equivalent

### Financial plan
Total expected monthly spending  
Planned saving  
Planned investing  
Unallocated money

### Current position
Current cash balance  
Current savings  
Current investments  
Other tracked balances

Example:

**Reliable income**  
31,500 SEK

**Average variable income**  
4,500 SEK

**Average monthly income**  
36,000 SEK

**Normal lifestyle cost**  
25,200 SEK

**Planned saving and investing**  
6,000 SEK

**Remaining unallocated money**  
4,800 SEK

**Current bank balances**  
92,000 SEK

**Current investments**  
110,000 SEK

The user should be able to correct values before confirming the plan.

---

# 17. Dashboard Purpose

The dashboard should answer the user's most important financial questions quickly.

It should prioritize decision-useful information rather than displaying every available metric simultaneously.

The following questions are within product scope.

---

# 18. Dashboard Questions

## 18.1 How much money do I actually have available this month?

The dashboard should calculate a safe-to-spend amount after accounting for:

- Expected costs
- Financial commitments
- Planned savings
- Known upcoming expenses

Example:

**Safe to spend this month: 6,420 SEK**

---

## 18.2 Where is my money going?

Provide a visual breakdown by major spending area.

Examples:

- Home
- Living
- Transport
- Finance
- Lifestyle
- Planned expenses

The user should be able to understand both monetary amount and relative share of income.

---

## 18.3 What costs me the most?

Highlight major individual cost drivers.

Example:

1. Rent — 8,500 SEK
2. Car — 5,800 SEK
3. Groceries — 4,000 SEK
4. Restaurants — 2,100 SEK
5. Subscriptions — 1,200 SEK

---

## 18.4 How much of my lifestyle is already committed?

Show committed costs versus flexible costs.

Example:

**Committed:** 18,700 SEK  
**Flexible:** 7,400 SEK

This should help the user understand how much spending could realistically be changed.

---

## 18.5 What is my minimum monthly cost of living?

Display the user's essential-cost figure.

Example:

**Essential monthly cost: 17,300 SEK**

---

## 18.6 What does my normal lifestyle cost?

Display expected real-world lifestyle cost.

Example:

**Normal lifestyle: 24,700 SEK/month**

---

## 18.7 How much am I saving?

Show:

- Monthly savings
- Savings rate
- Investing
- Other long-term contributions

Example:

**6,000 SEK/month**

**18.7% of reliable income**

---

## 18.8 What am I saving for?

Show savings broken down by purpose.

Examples:

- Emergency fund
- Investments
- House deposit
- Car
- Holiday
- Other goals

---

## 18.9 Am I on track for my goals?

Where a goal includes a target value, the dashboard should show progress.

Example:

**Car fund**

64,000 / 100,000 SEK

At the current contribution rate:

**Target expected May 2027**

---

## 18.10 What irregular expenses are coming up?

Examples:

- Vehicle tax
- Insurance renewal
- Holiday
- Christmas
- Car servicing
- Annual subscriptions

The dashboard should make unusually expensive upcoming periods visible.

Example:

**October expected spending: +4,300 SEK above normal**

---

## 18.11 What would happen if nothing changed?

Provide a forward financial projection based on the current plan.

Example:

**At your current plan, you would add approximately 72,000 SEK to savings over the next 12 months.**

---

## 18.12 How much money is currently unallocated?

This represents money remaining after:

Income  
− expected spending  
− planned savings  
− planned investing

Example:

**Unallocated: 2,900 SEK/month**

---

## 18.13 How stable is my income?

Show reliable income separately from variable income.

Example:

Reliable income — 31,500 SEK  
Average variable income — 5,000 SEK

---

## 18.14 Am I relying on variable income for essential expenses?

Example:

Reliable income — 28,000 SEK  
Essential costs — 30,500 SEK

This should clearly indicate that part of the user's essential lifestyle currently depends on variable income.

---

## 18.15 Which expenses could I realistically reduce?

Present flexible and optional spending separately.

Examples:

Restaurants — 2,500 SEK  
Subscriptions — 1,100 SEK  
Shopping — 1,800 SEK  
Entertainment — 1,300 SEK

The product should present the information rather than deciding what the user should remove.

---

## 18.16 What changed compared with the previous month?

Once actual financial tracking exists, show meaningful differences.

Example:

**Spending increased by 2,100 SEK**

Main differences:

Restaurants +900 SEK  
Transport +700 SEK  
Shopping +500 SEK

---

## 18.17 Am I above or below my plan?

Compare:

- Planned spending
- Actual spending

This should work at both total and category level.

---

## 18.18 How much can I spend per day or week?

Based on remaining flexible money and the remaining period.

Example:

Flexible spending remaining: 3,200 SEK

14 days remaining

**Approximate daily allowance: 229 SEK**

This should be understood as guidance, not a requirement to spend the same amount every day.

---

## 18.19 Can I afford a new recurring expense?

The user should be able to test a hypothetical recurring cost.

Example:

> What happens if I add a 4,000 SEK/month car payment?

The product should show the effect on:

- Safe-to-spend money
- Savings
- Breathing room
- Flexible spending
- Financial goals

---

## 18.20 What happens if my income changes?

The user should be able to model scenarios such as:

- Salary increase
- Salary decrease
- Reduced working hours
- Loss of employment
- Increased self-employment income
- Reduced self-employment income

---

## 18.21 How expensive is my car really?

Combine all relevant ownership costs into one financial figure.

Examples:

- Finance
- Insurance
- Fuel
- Vehicle tax
- Maintenance
- Repairs
- Parking
- Tolls

Display both monthly and annual equivalents.

---

## 18.22 How much am I spending on subscriptions?

Show the combined recurring subscription cost.

Example:

**1,740 SEK/month**

**20,880 SEK/year**

---

## 18.23 What do my largest costs equal annually?

Allow monthly costs to be understood on an annual basis.

Example:

Rent — 102,000 SEK/year  
Car — 78,600 SEK/year  
Restaurants — 25,200 SEK/year

---

## 18.24 How much breathing room do I have?

Breathing room represents money remaining after normal expected spending and planned financial goals.

Example:

Income — 34,200 SEK  
Lifestyle — 25,500 SEK  
Saving/investing — 5,700 SEK

**Breathing room: 3,000 SEK**

This is one of the core dashboard metrics.

---

## 18.25 How financially resilient am I?

The dashboard should communicate financial resilience through understandable values rather than a generic score.

Example:

Emergency savings: 68,000 SEK

Essential monthly cost: 17,000 SEK

**Emergency savings cover approximately 4 months of essential expenses.**

---

## 18.26 If my income stopped, how long could I maintain my life?

Show two different runway calculations where possible.

### Essential runway

How long available savings could cover essential expenses.

### Lifestyle runway

How long available savings could cover the user's normal lifestyle.

Example:

**Essential runway: 5.2 months**

**Current lifestyle runway: 3.6 months**

---

## 18.27 What percentage of my income is being used for today versus the future?

Example:

Current lifestyle — 72%

Planned future spending — 9%

Long-term saving/investing — 19%

This should provide a clear picture of how income is being allocated.

---

# 19. Current Financial Position on the Dashboard

The dashboard should include the user's current account and savings position.

Potential headline information:

**Everyday bank balance**

Money currently available in primary spending accounts.

**Cash savings**

Money held in savings accounts.

**Emergency savings**

Cash explicitly reserved for emergencies.

**Investments**

Tracked investment value.

**Total tracked financial assets**

Combined value of relevant tracked accounts.

These values should remain separate enough that the user can distinguish:

> Money I can spend now

from:

> Money I technically own but do not intend to spend

For example:

**Everyday money**  
14,500 SEK

**Savings**  
86,000 SEK

**Investments**  
120,000 SEK

**Total tracked assets**  
220,500 SEK

---

# 20. Dashboard Information Hierarchy

Not every supported question should appear as a large widget.

The primary dashboard should prioritize the most immediately useful information.

Suggested hierarchy:

## Primary overview

- Safe to spend
- Current bank balance / available cash
- Current savings
- Monthly income
- Normal monthly cost
- Planned saving/investing
- Breathing room

## Spending overview

- Where money goes
- Largest expenses
- Fixed/committed vs flexible spending
- Essential cost
- Lifestyle cost

## Savings and goals

- Savings rate
- Current savings
- Current investments
- Goal progress
- Future projection

## Upcoming

- Irregular upcoming expenses
- Expensive upcoming months
- Goal milestones

## Financial resilience

- Emergency fund
- Essential runway
- Lifestyle runway
- Stable vs variable income

## Planning tools

- Can I afford this?
- Income-change scenario
- Recurring-expense scenario
- Daily/weekly remaining spending

## Deeper analysis

- Subscriptions
- Car cost
- Annualized costs
- Planned versus actual
- Month-over-month changes

---

# 21. Planning Mode and Tracking Mode

The product should conceptually support two modes.

## Planning Mode

Planning Mode is based on what the user expects their financial life to look like.

It can function without transaction history.

It answers:

- What does my life cost?
- What can I afford?
- How much should remain?
- How much am I planning to save?
- What happens if something changes?

This should be valuable on its own.

---

## Tracking Mode

Tracking Mode compares the financial plan with reality.

It adds questions such as:

- What did I actually spend?
- Did I exceed my plan?
- Which categories changed?
- What is my real savings rate?
- How is this month different from previous months?

Tracking Mode should extend the financial model rather than replace it.

Tracking Mode does not mean importing bank transactions. It means the app remembers: each month's
costs, balances and the plan as it stood are kept so that a month can be looked at a year later and is
not rewritten by later edits. The user records real figures by hand (confirming a bill, updating a
balance), and the app closes each month automatically.

Storage follows from this. The app works fully offline with local storage and no account. An optional
account syncs the data as a single document encrypted on the device, so the server never sees an amount.
See the technical plan, section "Tracking Mode", for the phases.

---

# 22. Customization

The product should avoid forcing every user into the same financial structure.

Users should be able to:

- Add custom expenses
- Add custom income
- Add custom categories or sub-items where appropriate
- Rename entries
- Remove irrelevant sections
- Mark expenses according to their own circumstances
- Add custom savings goals
- Add custom accounts

A predefined structure should make onboarding easy, but customization should prevent the product from becoming restrictive.

---

# 23. User Control Over Assumptions

The product should avoid making strong assumptions about what is financially good or bad.

For example:

A 4,000 SEK/month hobby is not automatically problematic.

A 6,000 SEK/month car is not automatically unaffordable.

A low restaurant budget is not automatically financially responsible.

The product should instead show consequences.

Example:

> Adding this expense would reduce your monthly breathing room from 5,200 SEK to 1,200 SEK.

The user then decides whether that trade-off is acceptable.

---

# 24. Primary Outcome

After completing onboarding, the user should be able to understand their financial situation within a few seconds.

At minimum, they should know:

**How much money I have**

**How much money comes in**

**How much my life costs**

**How much is already committed**

**How much I can safely spend**

**How much I am saving**

**How much breathing room I have**

**How long my savings could support me**

**What major expenses are coming**

**Whether I can afford a financial change**

The product should turn a collection of bills, balances, income streams and savings goals into one coherent view of the user's financial life.

---

# 25. Out of Scope for This Handoff

This document intentionally does not define:

- Technical architecture
- Programming language
- Framework
- Database
- Hosting
- Authentication implementation
- Bank integration approach
- Transaction import implementation
- Financial-data providers
- API design
- Data synchronization
- Infrastructure
- AI implementation
- Calculation engine implementation
- Security architecture
- Deployment strategy

Those decisions should be made separately after the product requirements and desired user experience are established.
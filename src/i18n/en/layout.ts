export default {
  month: {
    previous: 'Previous month',
    next: 'Next month',
    backToCurrent: 'Back to the current month',
  },
  upcoming: {
    button: 'Upcoming',
    title: 'Coming up',
    subtitle: 'Irregular costs in the next 30 days',
    emptyTitle: 'Nothing unusual ahead',
    emptyDescription: 'No irregular expenses fall in the next 30 days.',
  },
  theme: {
    toDark: 'Switch to dark mode',
    toLight: 'Switch to light mode',
  },
  bottomNav: {
    planning: 'Planning',
    add: 'Add',
    more: 'More',
  },
  moreSheet: {
    title: 'All sections',
  },
  quickAdd: {
    title: 'What would you like to add?',
    expense: { label: 'Expense', description: 'A bill, cost or subscription' },
    income: { label: 'Income', description: 'Salary, freelance, benefits' },
    goal: { label: 'Savings goal', description: 'Something you are saving for' },
    account: { label: 'Account', description: 'A bank or investment account' },
    loan: { label: 'Loan', description: 'CSN, mortgage, car loan or credit' },
  },
  update: {
    title: 'A new version of Finly is ready',
    body: 'Reload to get the latest changes.',
    reload: 'Reload',
    later: 'Later',
  },
  frozenMonth: {
    title: (month: string, closedOn: string) => `${month} as it was closed on ${closedOn}`,
    back: 'Back to this month',
    body: 'Edits to income, costs and balances apply to your current plan. Bill amounts you enter here stay with this month.',
  },
};

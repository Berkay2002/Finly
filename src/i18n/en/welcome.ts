export default {
  eyebrow: 'Made for Swedish households',
  headline: 'Know what is safe to spend. Every month.',
  intro:
    'Finly turns your income, bills, savings and balances into one clear number: how much you can spend this month without touching what you have set aside.',
  plan: {
    title: 'Plan my finances',
    description: 'A guided session in ten short steps. Skip anything that does not apply to you.',
    cta: 'Start planning',
  },
  demo: {
    title: 'Explore with sample data',
    description: 'See the full dashboard with an example plan. You can edit everything or reset it later.',
    cta: 'Explore with sample data',
  },
  skip: 'Skip for now',
  privacy: 'Everything stays in this browser unless you turn on sync, and even then it is encrypted before it leaves.',
  preview: {
    caption: 'Example plan',
    safeToSpend: 'Safe to spend',
    usually: (range: string) => `Usually ${range}`,
    income: 'Income',
    cost: 'Normal month',
    saving: 'Saving',
    legend: {
      essential: 'Essentials',
      optional: 'Optional',
      saving: 'Saving',
      left: 'Left over',
    },
  },
  features: [
    {
      title: 'One honest number',
      body: 'Bills, subscriptions, loans and savings are taken off before you see what is left, so the number you get is the one you can actually use.',
    },
    {
      title: 'Bills that vary',
      body: 'Electricity, groceries and other costs that swing are planned as a range, and the real bill replaces the estimate when it arrives.',
    },
    {
      title: 'Months ahead',
      body: 'Step forward to see how a raise, a new loan or a bigger saving goal plays out before you commit to it.',
    },
  ],
};

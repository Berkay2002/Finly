export default {
  title: "Let's plan your financial life",
  subtitle: 'A few simple steps to get a clear picture and a personalised plan.',
  skipForNow: 'Skip for now',
  stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  aboutYou: {
    title: 'About you',
    description: 'Where you live sets your net salary and electricity costs. Your birth year sets how long you pay CSN.',
    languageHint: 'Which language do you want Finly in?',
  },
  loans: {
    title: 'Loans',
    description:
      'CSN, bolån, billån and credit. Payments count as essential costs; the balance and rate show what the debt really costs you.',
  },
  bankingInsurance: 'Banking and insurance',
  accuracyTip: 'Be as accurate as you can. You can always update this later.',
  back: 'Back',
  addLater: "I'll add this later",
  confirm: 'Confirm plan & open dashboard',
  continueTo: (step: string) => `Continue to ${step}`,
  progress: 'Your planning progress',
  progressCount: (done: number, total: number) => `${done} of ${total}`,
  progressNote: "You're on your way to a clearer tomorrow.",
};

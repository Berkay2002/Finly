import type { Messages } from '../en';

export default {
  income: {
    salary: 'Lön',
    salaryNote: 'Huvudjobb',
    bonus: 'Bonus',
    bonusNote: 'Årlig (utslagen per månad)',
    freelance: 'Frilansuppdrag',
    freelanceNote: 'Designprojekt',
    gifts: 'Gåvor',
    giftsNote: 'Uppskattat snitt',
  },
  expenses: {
    variablePrice: 'Rörligt pris',
    includedInRent: 'Ingår i hyran',
    annualHomeInsurance: 'Årlig hemförsäkring',
  },
  accounts: {
    everyday: 'Vardagskonto',
    salary: 'Lönekonto',
    savings: 'Sparkonto',
    emergency: 'Buffert',
    joint: 'Gemensamt konto',
  },
  goals: {
    emergency: 'Buffert',
    emergencyDescription: 'Ekonomisk trygghet när livet inte går som planerat.',
    house: 'Kontantinsats',
    houseDescription: 'Vårt första hem.',
    holiday: 'Semester',
    holidayDescription: 'Se mer av världen.',
    car: 'Bilsparande',
    carDescription: 'För en friare vardag.',
    laptop: 'Ny laptop',
    laptopDescription: 'En uppgradering för jobb och kreativitet.',
  },
  you: 'Du',
} satisfies Messages['sample'];

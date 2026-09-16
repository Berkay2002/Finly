import type { Messages } from '../en';

export default {
  home: {
    kommun: 'Kommun',
    notSet: 'Inte vald',
    electricityArea: 'Elområde',
    areaHint: '',
    fromKommun: (area, kommun) => `${area} (utifrån ${kommun})`,
    notSure: 'Vet inte (SE3)',
    splitKommun: (kommun) => `${kommun} kan ligga i mer än ett elområde. Kolla ”Elområde” på din elräkning.`,
  },
  food: {
    ageGroups: {
      '0': 'Under 1 år',
      '1-3': '1–3 år',
      '4-6': '4–6 år',
      '7-10': '7–10 år',
      '11-14': '11–14 år',
      '15-17': '15–17 år',
      '18-24': '18–24 år',
      '25-50': '25–50 år',
      '51-70': '51–70 år',
      '71+': '71 år eller äldre',
    },
    whoFor: 'Vilka handlar du mat till?',
    lunchAtHome: 'Lunch hemma',
    lunchOut: 'Lunch ute',
    removePerson: 'Ta bort person',
    addPerson: 'Lägg till person',
    lunchOutInfo: 'Vad räknas som lunch ute?',
    lunchOutNote: '”Lunch ute” är skollunch eller lunch som köps på jobbet. Matlåda räknas som hemma.',
    source: (year) => `Konsumentverket ${year}`,
    aMonth: 'i månaden',
    aWeek: (amount) => `≈ ${amount} i veckan`,
    disclaimer: 'Utgår från att maten lagas hemma. Se det som en startpunkt.',
    workLunches: ' Luncher på jobbet ingår inte.',
    cancel: 'Avbryt',
  },
  spot: {
    unavailable: (status) => `Spotpriserna går inte att hämta just nu (${status}).`,
    noPrices: 'Inga spotpriser har publicerats för den månaden än.',
  },
} satisfies Messages['household'];

import type { Messages } from '../en';

export default {
  delta: {
    vsLastMonth: 'mot förra månaden',
  },
  donut: {
    ofTotal: (share) => `${share} av totalen`,
  },
  menu: {
    moreOptions: 'Fler alternativ',
  },
  sheet: {
    close: 'Stäng',
  },
} satisfies Messages['ui'];

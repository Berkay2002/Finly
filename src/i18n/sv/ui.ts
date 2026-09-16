import type { Messages } from '../en';

export default {
  delta: {
    vsLastMonth: 'mot förra månaden',
  },
  donut: {
    ofTotal: (share) => `${share} av totalen`,
    ofWhichHeld: (amount) => `${amount} avsatt`,
    heldHint: 'Randigt: avsatt för en räkning som betalas senare',
  },
  menu: {
    moreOptions: 'Fler alternativ',
  },
  sheet: {
    close: 'Stäng',
  },
} satisfies Messages['ui'];

import { plural } from '../plural';

export default {
  tenPlusYears: '10+ years',
  months: (n: string, count: number) => `${n} ${plural(count, 'month', 'months')}`,
  years: (n: number) => `${n} ${plural(n, 'year', 'years')}`,
  never: 'Never at this rate',
  reached: 'Reached',
  million: 'M',
  thousand: 'K',
};

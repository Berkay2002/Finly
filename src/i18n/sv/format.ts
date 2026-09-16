import type { Messages } from '../en';
import { plural } from '../plural';

export default {
  tenPlusYears: '10+ år',
  months: (n, count) => `${n} ${plural(count, 'månad', 'månader')}`,
  years: (n) => `${n} år`,
  never: 'Aldrig i den här takten',
  reached: 'Uppnått',
  million: ' mn',
  thousand: 'k',
} satisfies Messages['format'];

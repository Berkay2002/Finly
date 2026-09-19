import type { Messages } from '../en';

export default {
  dueTomorrow: (name) => `${name} ska betalas i morgon`,
  monthClosed: (month) => `${month} är stängd`,
  monthClosedBody: 'Se hur månaden gick och vad som ändrades.',
} satisfies Messages['push'];

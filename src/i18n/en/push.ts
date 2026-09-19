/** Notification text. Rendered on the device and encrypted before upload; the service worker only shows it. */
export default {
  dueTomorrow: (name: string) => `${name} is due tomorrow`,
  monthClosed: (month: string) => `${month} is closed`,
  monthClosedBody: 'See how the month went and what changed.',
};

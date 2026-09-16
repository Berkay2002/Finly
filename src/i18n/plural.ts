/** `one` when n is 1, else `other`. English and Swedish share this rule. */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

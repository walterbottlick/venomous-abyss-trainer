/**
 * The "3, 2, 1" before a fight. `elapsed` is the seconds since the countdown began; it shows each
 * number for `secondsPerNumber`. Returns null once it is over.
 */
export function countdownNumber(
  elapsed: number,
  from: number,
  secondsPerNumber: number = 1,
): number | null {
  const step = Math.floor(elapsed / secondsPerNumber);
  return step >= from ? null : from - step;
}

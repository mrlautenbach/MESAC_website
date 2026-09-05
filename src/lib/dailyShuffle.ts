// Deterministic shuffle keyed to today's date (UTC) - every visitor sees
// the same order on a given day (so reloading doesn't reshuffle), and it
// rotates to a different order tomorrow with no stored state or cron job.
export function dailyShuffle<T>(items: T[]): T[] {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  let seed = 0;
  for (let i = 0; i < today.length; i++) {
    seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
  }

  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0; // linear congruential generator step
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

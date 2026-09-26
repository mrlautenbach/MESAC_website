// Round-robin pairings by the circle method: every item meets every other
// once, one pairing each per round. An odd count gets a bye each round.
export function roundRobin<T>(items: T[]): [T, T][][] {
  const list: (T | null)[] = items.length % 2 === 0 ? [...items] : [...items, null];
  const rounds: [T, T][][] = [];
  for (let r = 0; r < list.length - 1; r++) {
    const round: [T, T][] = [];
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

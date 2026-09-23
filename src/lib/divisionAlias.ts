// A division can go by more than one common spelling - "JV" and "Junior
// Varsity" mean the same thing, whichever one an admin actually named the
// Division. Normalizing both a Division's stored name and a CSV's division
// column through this before comparing lets either spelling match it.
const DIVISION_ALIASES: Record<string, string> = {
  jv: "junior varsity",
};

export function normalizeDivisionName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return DIVISION_ALIASES[lower] ?? lower;
}

const GENDER_WORDS: Record<string, "girls" | "boys"> = {
  girl: "girls",
  girls: "girls",
  women: "girls",
  womens: "girls",
  female: "girls",
  boy: "boys",
  boys: "boys",
  men: "boys",
  mens: "boys",
  male: "boys",
};

// Finds the division a CSV's gender/division cell means: an exact (aliased)
// name match first, then - for a gender word - the one division whose name
// includes it, so "Girls" still matches a division named "Varsity Girls" or
// "Girls Volleyball". Two divisions both mentioning girls is ambiguous and
// matches neither.
export function findDivision<T extends { name: string }>(divisions: T[], raw: string): T | undefined {
  const key = normalizeDivisionName(raw);
  const exact = divisions.find((d) => normalizeDivisionName(d.name) === key);
  if (exact) return exact;
  const gender = GENDER_WORDS[key.replace(/[^a-z]/g, "")];
  if (!gender) return undefined;
  const hits = divisions.filter((d) =>
    d.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((word) => GENDER_WORDS[word] === gender)
  );
  return hits.length === 1 ? hits[0] : undefined;
}

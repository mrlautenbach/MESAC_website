// Matches by substring, not exact name, so a compound division like
// "Girls JV" or "Boys Varsity" still gets the girls/boys color instead of
// falling through to neutral.
export function divisionTagClass(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("girls") ? "tag-girls" : lower.includes("boys") ? "tag-boys" : "tag-neutral";
}

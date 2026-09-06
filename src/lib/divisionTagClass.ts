export function divisionTagClass(name: string) {
  const lower = name.toLowerCase();
  return lower === "girls" ? "tag-girls" : lower === "boys" ? "tag-boys" : "tag-neutral";
}

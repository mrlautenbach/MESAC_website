// A name as it appears in a URL: lowercase letters and digits joined by
// single hyphens ("Girls JV" -> "girls-jv"), cut to `max` characters.
// Empty when the name has no letters or digits, so callers supply a fallback.
export function slugify(text: string, max = 80): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

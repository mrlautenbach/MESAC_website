// Small brand-color swatch shown next to a school's name wherever it
// appears in a list. Renders nothing when the school hasn't set a color,
// rather than a placeholder dot for every school. With a secondary color
// set, renders as a two-tone (split) swatch instead of a solid dot.
export function SchoolColorDot({
  color,
  secondaryColor,
  className = "",
}: {
  color?: string | null;
  secondaryColor?: string | null;
  className?: string;
}) {
  if (!color) return null;
  if (!secondaryColor) {
    return (
      <span
        aria-hidden
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 align-middle ${className}`}
        style={{ backgroundColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 align-middle ${className}`}
      style={{ background: `linear-gradient(135deg, ${color} 50%, ${secondaryColor} 50%)` }}
    />
  );
}

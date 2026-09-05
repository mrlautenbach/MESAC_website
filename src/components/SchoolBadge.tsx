import Image from "next/image";
import { SchoolColorDot } from "@/components/SchoolColorDot";

// Small identity mark shown next to a school's name in schedule/results
// tables - its uploaded logo once it has one, falling back to its brand
// color swatch (or nothing) until then.
export function SchoolBadge({
  logoUrl,
  name,
  color,
  secondaryColor,
  size = 24,
  className = "",
}: {
  logoUrl?: string | null;
  name: string;
  color?: string | null;
  secondaryColor?: string | null;
  // Pixel size for the logo image only - the color-dot fallback stays its
  // own small fixed size regardless, since it's a decorative accent, not
  // a stand-in for an actual logo.
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full border border-black/10 object-contain align-middle ${className}`}
      />
    );
  }
  return <SchoolColorDot color={color} secondaryColor={secondaryColor} className={className} />;
}

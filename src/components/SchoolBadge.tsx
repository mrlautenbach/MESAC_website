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
  className = "",
}: {
  logoUrl?: string | null;
  name: string;
  color?: string | null;
  secondaryColor?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={24}
        height={24}
        className={`h-6 w-6 shrink-0 rounded-full border border-black/10 object-contain align-middle ${className}`}
      />
    );
  }
  return <SchoolColorDot color={color} secondaryColor={secondaryColor} className={className} />;
}

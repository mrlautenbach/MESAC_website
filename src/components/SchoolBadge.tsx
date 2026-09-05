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
        width={18}
        height={18}
        className={`h-[18px] w-[18px] shrink-0 rounded-full border border-black/10 object-contain align-middle ${className}`}
      />
    );
  }
  return <SchoolColorDot color={color} secondaryColor={secondaryColor} className={className} />;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/records", label: "History" },
  { href: "/schools", label: "Schools" },
];

export function NavLinks({ linkClassName }: { linkClassName?: string }) {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname?.startsWith(link.href) ? "page" : undefined}
          className={linkClassName}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

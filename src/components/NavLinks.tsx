"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Scores" },
  { href: "/tournaments", label: "Standings" },
  { href: "/schedule", label: "Schedule" },
  { href: "/records", label: "Records" },
  { href: "/schools", label: "Schools" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => {
        const isCurrent = link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={isCurrent ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

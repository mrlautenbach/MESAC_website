import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";

// Column headings here are labels, not document structure - the footer sits
// after <main>, so a real heading level would wire nonsense into the page
// outline. One sr-only h2 names the landmark; the rest are styled spans.
function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">{children}</div>
  );
}

export async function SiteFooter() {
  const schools = await prisma.school.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <footer className="relative overflow-hidden border-t-2 border-divider bg-foreground text-background">
      <div className="lattice-panel absolute inset-0 text-accent opacity-[.1]" />
      <h2 className="sr-only">Site footer</h2>

      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-[1.3fr_1fr_1.4fr] sm:px-10">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/mesac-logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-lg font-extrabold tracking-tight">MESAC</span>
          </Link>
          <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-background/70">
            The Middle East South Asian Conference — six international schools, three seasons, one calendar.
          </p>
        </div>

        <nav aria-label="Footer">
          <ColumnLabel>Browse</ColumnLabel>
          <ul className="space-y-1.5 text-[13px]">
            {[
              { href: "/tournaments", label: "Tournaments" },
              { href: "/schedule", label: "Schedule" },
              { href: "/records", label: "History" },
              { href: "/schools", label: "Schools" },
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <ColumnLabel>Seasons</ColumnLabel>
            <ul className="space-y-1.5 text-[13px] text-background/70">
              {[1, 2, 3].map((order) => (
                <li key={order} className="flex justify-between gap-4">
                  <span>Season {order}</span>
                  <span className="tabular-nums">{SEASON_DATE_RANGES[order]}</span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div>
          <ColumnLabel>Member schools</ColumnLabel>
          {/* Names only - there are no per-school pages to link to; the
              directory itself is one click away under Browse. */}
          <ul className="grid gap-1.5 text-[13px] text-background/70 sm:grid-cols-2">
            {schools.map((school) => (
              <li key={school.id}>{school.name}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-accent/25 px-6 py-5 text-[12px] text-background/60 sm:px-10">
        <span>&copy; {new Date().getFullYear()} Middle East South Asian Conference</span>
        <Link href="/login" className="hover:text-accent">
          Admin login
        </Link>
      </div>
    </footer>
  );
}

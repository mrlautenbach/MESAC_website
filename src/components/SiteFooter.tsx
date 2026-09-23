import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

// Column headings here are labels, not document structure - the footer sits
// after <main>, so a real heading level would wire nonsense into the page
// outline. One sr-only h2 names the landmark; the rest are styled spans.
function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">{children}</div>
  );
}

export async function SiteFooter() {
  // This footer sits in the root layout, so it renders on every route -
  // including /_not-found and error pages, where the database may be
  // unreachable or irrelevant. The school list is decorative; losing it must
  // not take the surrounding page down with it.
  let schools: { id: string; name: string; code: string | null; logoUrl: string | null }[] = [];
  try {
    schools = await prisma.school.findMany({
      // Guest schools play in tournaments but aren't part of the league roster.
      where: { isLeagueMember: true },
      select: { id: true, name: true, code: true, logoUrl: true },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Footer school list unavailable", error);
  }

  return (
    <footer className="relative overflow-hidden border-t-2 border-divider bg-foreground text-background">
      <div className="lattice-panel absolute inset-0 text-accent opacity-[.1]" />
      <h2 className="sr-only">Site footer</h2>

      <div className="page-wrap relative grid gap-10 py-12 sm:grid-cols-[1fr_0.6fr_2.8fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/mesac-logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-lg font-extrabold tracking-tight">MESAC</span>
          </Link>
          <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-background/70">
            The Middle East South Asian Conference: six international schools, three seasons, one calendar.
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
        </nav>

        <div className={schools.length === 0 ? "hidden" : undefined}>
          <ColumnLabel>Member schools</ColumnLabel>
          {/* Names only - there are no per-school pages to link to; the
              directory itself is one click away under Browse. Each logo sits
              on a white chip, the same treatment the host school gets in
              SeasonHero, since school marks are drawn for light grounds and
              would otherwise disappear into the navy. */}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] text-background/70">
            {schools.map((school) => (
              <li key={school.id} className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden border border-accent/30 bg-white p-0.5">
                  {school.logoUrl ? (
                    <Image
                      src={school.logoUrl}
                      alt=""
                      width={24}
                      height={24}
                      sizes="24px"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[7px] font-bold leading-none text-primary-deep">
                      {school.code ?? school.name.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </span>
                {school.name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="page-wrap relative">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-accent/25 py-5 text-[12px] text-background/60">
          <span>&copy; {new Date().getFullYear()} Middle East South Asian Conference</span>
          <Link href="/login" className="hover:text-accent">
            Admin login
          </Link>
        </div>
      </div>
    </footer>
  );
}

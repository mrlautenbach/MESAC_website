"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// `match` lists every path prefix that belongs to a tab, so pages reached
// from it (e.g. the CSV import under Tournaments) keep that tab highlighted.
const TABS = [
  { href: "/dashboard", label: "Overview", match: ["/dashboard/events"], exact: true },
  { href: "/dashboard/results", label: "Results", match: [] },
  {
    href: "/dashboard/admin/tournaments",
    label: "Tournaments",
    match: ["/dashboard/admin/events", "/dashboard/admin/meet-schedule", "/dashboard/admin/tournament-photos", "/dashboard/admin/golf", "/dashboard/admin/academic-games"],
  },
  { href: "/dashboard/admin/schools", label: "Schools", match: [], adminOnly: true },
  { href: "/dashboard/admin/records", label: "History", match: [], adminOnly: true },
  { href: "/dashboard/admin/users", label: "Accounts", match: [], adminOnly: true },
  { href: "/dashboard/admin/audit-log", label: "Audit log", match: [], adminOnly: true },
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";

  const isActive = (tab: (typeof TABS)[number]) =>
    (tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)) ||
    tab.match.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className="border-b-2 border-divider bg-surface/60">
      <div className="page-wrap flex items-center gap-4">
        <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:inline">
          Admin
        </span>
        <nav aria-label="Dashboard" className="-mb-0.5 flex overflow-x-auto [scrollbar-width:none]">
          {TABS.filter((tab) => isAdmin || !tab.adminOnly).map((tab) => (
            <Link key={tab.href} href={tab.href} aria-current={isActive(tab) ? "page" : undefined} className="tab-link">
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/dashboard/change-password"
          aria-current={pathname === "/dashboard/change-password" ? "page" : undefined}
          className="tab-link ml-auto shrink-0"
        >
          Change password
        </Link>
      </div>
    </div>
  );
}

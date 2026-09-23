import Link from "next/link";
import { LiveIcon } from "@/components/icons/LiveIcon";

type Tab = "schedule" | "results" | "watch-live" | "team-photos";

// One tab bar for every page of a tournament. Schedule and Results are
// split by division (with a switch to move between them); Watch live and
// Team photos are always tournament-wide. Meet-style activities also get an
// "Overall" choice covering every division at once.
export function TournamentSubNav({
  tournamentSlug,
  divisions,
  usesMeetResults,
  currentDivisionSlug = null,
  active,
}: {
  tournamentSlug: string;
  divisions: { name: string; slug: string }[];
  usesMeetResults: boolean;
  currentDivisionSlug?: string | null;
  active?: Tab;
}) {
  const root = `/seasons/${tournamentSlug}`;
  const hasDivisions = divisions.length > 0;
  // Team sports with divisions have no combined page, so the tabs need a
  // division to land on when none is chosen yet.
  const divisionSlug = currentDivisionSlug ?? (hasDivisions && !usesMeetResults ? divisions[0].slug : null);
  const splitBase = divisionSlug ? `${root}/${divisionSlug}` : root;

  const tabs: { key: Tab; label: string; href: string; icon?: boolean }[] = [
    { key: "schedule", label: "Schedule", href: `${splitBase}/schedule` },
    { key: "results", label: "Results", href: `${splitBase}/results` },
    { key: "watch-live", label: "Watch live", href: `${root}/watch-live`, icon: true },
    { key: "team-photos", label: "Photos", href: `${root}/team-photos` },
  ];

  const divisionScoped = active === "schedule" || active === "results";
  const divisionChoices = [
    ...(usesMeetResults ? [{ name: "Overall", slug: null as string | null }] : []),
    ...divisions.map((d) => ({ name: d.name, slug: d.slug as string | null })),
  ];

  return (
    <div className="sticky top-0 z-20 border-b-2 border-divider bg-background">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:px-6">
        <nav aria-label="Tournament" className="-mb-0.5 flex overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={tab.key === active ? "page" : undefined}
              className="tab-link"
            >
              {tab.icon && <LiveIcon />}
              {tab.label}
            </Link>
          ))}
        </nav>

        {divisionScoped && hasDivisions && divisionChoices.length > 1 && (
          <div role="group" aria-label="Division" className="mb-2 inline-flex border border-border sm:mb-0 sm:ml-auto">
            {divisionChoices.map((d) => {
              const isCurrent = d.slug === currentDivisionSlug;
              return (
                <Link
                  key={d.slug ?? "overall"}
                  href={`${d.slug ? `${root}/${d.slug}` : root}/${active}`}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`px-3 py-1.5 text-sm font-semibold ${isCurrent ? "bg-primary text-background" : "text-muted hover:text-foreground"}`}
                >
                  {d.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

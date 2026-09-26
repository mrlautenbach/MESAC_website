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
  usesAcademicFormat = false,
  currentDivisionSlug = null,
  active,
  viewSwitch,
}: {
  tournamentSlug: string;
  divisions: { name: string; slug: string }[];
  usesMeetResults: boolean;
  // Academic Games shows both tracks side by side on the tournament-wide
  // pages, with a "Both" choice beside Varsity and JV.
  usesAcademicFormat?: boolean;
  currentDivisionSlug?: string | null;
  active?: Tab;
  // Two sides to Schedule and Results, switched beside the division switch:
  // golf's Individual (Day 1) and Team (match play), Academic Games' Events
  // and Bowl. The first option is the default; the others are ?view=<key>.
  viewSwitch?: { options: { key: string; label: string }[]; current: string };
}) {
  const root = `/seasons/${tournamentSlug}`;
  const hasDivisions = divisions.length > 0;
  // Team sports with divisions have no combined page, so the tabs need a
  // division to land on when none is chosen yet.
  const hasCombined = usesMeetResults || usesAcademicFormat;
  const divisionSlug = currentDivisionSlug ?? (hasDivisions && !hasCombined ? divisions[0].slug : null);
  const splitBase = divisionSlug ? `${root}/${divisionSlug}` : root;
  // Moving between Schedule and Results, or divisions, keeps the side selected.
  const queryFor = (key: string) => (viewSwitch && key !== viewSwitch.options[0].key ? `?view=${key}` : "");
  const viewQuery = viewSwitch ? queryFor(viewSwitch.current) : "";

  // `short` is the phone label, so all four tabs fit without scrolling.
  const tabs: { key: Tab; label: string; short?: string; href: string; icon?: boolean }[] = [
    { key: "schedule", label: "Schedule", href: `${splitBase}/schedule${viewQuery}` },
    { key: "results", label: "Results", href: `${splitBase}/results${viewQuery}` },
    { key: "watch-live", label: "Watch live", short: "Live", href: `${root}/watch-live`, icon: true },
    { key: "team-photos", label: "Team photos", short: "Photos", href: `${root}/team-photos` },
  ];

  const divisionScoped = active === "schedule" || active === "results";
  const divisionChoices = [
    ...(hasCombined ? [{ name: usesMeetResults ? "Overall" : "Both", slug: null as string | null }] : []),
    ...divisions.map((d) => ({ name: d.name, slug: d.slug as string | null })),
  ];

  const showDivisions = hasDivisions && divisionChoices.length > 1;
  const toggles =
    divisionScoped && (viewSwitch || showDivisions) ? (
      <>
        {viewSwitch && (
          <div role="group" aria-label="Competition" className="inline-flex border border-border">
            {viewSwitch.options.map((view) => (
              <Link
                key={view.key}
                href={`${currentDivisionSlug ? `${root}/${currentDivisionSlug}` : root}/${active}${queryFor(view.key)}`}
                aria-current={view.key === viewSwitch.current ? "page" : undefined}
                className={`flex min-h-10 items-center px-3 py-1.5 text-sm font-semibold sm:min-h-0 ${view.key === viewSwitch.current ? "bg-primary text-background" : "text-muted hover:text-foreground"}`}
              >
                {view.label}
              </Link>
            ))}
          </div>
        )}

        {showDivisions && (
          <div role="group" aria-label="Division" className="inline-flex border border-border">
            {divisionChoices.map((d) => {
              const isCurrent = d.slug === currentDivisionSlug;
              return (
                <Link
                  key={d.slug ?? "overall"}
                  href={`${d.slug ? `${root}/${d.slug}` : root}/${active}${viewQuery}`}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex min-h-10 items-center px-3 py-1.5 text-sm font-semibold sm:min-h-0 ${isCurrent ? "bg-primary text-background" : "text-muted hover:text-foreground"}`}
                >
                  {d.name}
                </Link>
              );
            })}
          </div>
        )}
      </>
    ) : null;

  return (
    <>
      <div className="sticky top-0 z-20 border-b-2 border-divider bg-background">
        <div className="page-wrap flex flex-wrap items-center gap-x-6 gap-y-2">
          <nav aria-label="Tournament" className="-mb-0.5 flex overflow-x-auto [scrollbar-width:none]">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={tab.key === active ? "page" : undefined}
                className="tab-link"
              >
                {tab.icon && <LiveIcon />}
                {tab.short ? (
                  <>
                    <span className="sm:hidden">{tab.short}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </>
                ) : (
                  tab.label
                )}
              </Link>
            ))}
          </nav>

          {toggles && <div className="hidden flex-wrap gap-2 sm:ml-auto sm:flex">{toggles}</div>}
        </div>
      </div>
      {/* On a phone the switches sit below the tabs, outside the sticky bar,
        which would otherwise grow to two rows while scrolling. */}
      {toggles && <div className="page-wrap flex flex-wrap gap-2 pt-4 sm:hidden">{toggles}</div>}
    </>
  );
}

import Link from "next/link";
import { format } from "date-fns";
import { SchoolBadge } from "@/components/SchoolBadge";
import { LiveIcon } from "@/components/icons/LiveIcon";
import { sideLabel } from "@/lib/eventDisplay";
import { divisionTagClass } from "@/lib/divisionTagClass";
import { StatusTag } from "@/components/StatusTag";

// One row per event, rendered once. See the `.erow` block in globals.css for
// how the same cells become a card below sm and a subgrid row at sm+ - this
// used to be two full renderings of every event with one hidden by CSS, which
// cost about a third of the page (the RSC payload serializes the hidden copy
// too, not just the HTML).

export type EventRowEvent = {
  id: string;
  slug: string;
  title: string | null;
  date: Date;
  location: string | null;
  status: string;
  externalId: string | null;
  streamUrl: string | null;
  homeSourceOutcome: "WINNER" | "LOSER" | null;
  awaySourceOutcome: "WINNER" | "LOSER" | null;
  homeSourceStanding: number | null;
  awaySourceStanding: number | null;
  homeSourceLabel: string | null;
  awaySourceLabel: string | null;
  homeSourceEvent: { externalId: string | null } | null;
  awaySourceEvent: { externalId: string | null } | null;
  division: { name: string } | null;
  participants: {
    isHome: boolean;
    schoolId: string;
    school: { name: string; logoUrl: string | null; themeColor: string | null; themeColorSecondary: string | null };
  }[];
  results: { schoolId: string; score: number | null }[];
  sets: { homeScore: number; awayScore: number }[];
  fieldValues: { fieldId: string; value: string }[];
};

export type EventRowsProps = {
  events: EventRowEvent[];
  customFields: { id: string; label: string }[];
  tournamentSlug: string;
  scoringType: "WIN_LOSS" | "LOW_SCORE" | "NONE";
  usesSetScores: boolean;
  showDivisionTag: boolean;
  /** Status + Watch columns - hidden on the results view, where every row is
   *  completed and a stream link is meaningless. */
  showWatch: boolean;
};

/** Column track widths, in the order the cells are emitted. Only the columns
 *  actually rendered are included, so the header and every row agree. */
function columnTracks({ scoringType, usesSetScores, showDivisionTag, showWatch, customFields }: EventRowsProps) {
  const scored = scoringType !== "NONE";
  return [
    scored && "minmax(3.5rem, auto)", // Game
    "minmax(11rem, 1.4fr)", // Home
    scored && "3.5rem", // Score
    "minmax(11rem, 1.4fr)", // Away
    scored && "3.5rem", // Score
    usesSetScores && "max-content", // Sets
    showDivisionTag && "max-content", // Division
    "max-content", // Time
    "max-content", // Court
    ...customFields.map(() => "max-content"),
    showWatch && "max-content", // Status
    showWatch && "max-content", // Watch
  ]
    .filter(Boolean)
    .join(" ");
}

function Side({
  participant,
  outcome,
  sourceExternalId,
  sourceStanding,
  sourceLabel,
}: {
  participant: EventRowEvent["participants"][number] | undefined;
  outcome: "WINNER" | "LOSER" | null;
  sourceExternalId: string | null | undefined;
  sourceStanding: number | null;
  sourceLabel: string | null;
}) {
  return (
    <>
      <SchoolBadge
        size={36}
        logoUrl={participant?.school.logoUrl}
        name={participant?.school.name ?? "TBD"}
        color={participant?.school.themeColor}
        secondaryColor={participant?.school.themeColorSecondary}
      />
      {sideLabel(participant, outcome, sourceExternalId, sourceStanding, sourceLabel)}
    </>
  );
}

export function EventRows(props: EventRowsProps) {
  const { events, customFields, tournamentSlug, scoringType, usesSetScores, showDivisionTag, showWatch } = props;
  const scored = scoringType !== "NONE";
  const eventHref = (slug: string) => `/seasons/${tournamentSlug}/events/${slug}`;
  const tracks = columnTracks(props);

  // Grouped by calendar day, each under a date banner instead of a per-row
  // Date column. `events` arrives date-ordered, so first-seen day order is
  // already chronological.
  const dayGroups: { key: string; events: EventRowEvent[] }[] = [];
  const indexByDay = new Map<string, number>();
  for (const event of events) {
    const key = format(event.date, "yyyy-MM-dd");
    if (!indexByDay.has(key)) {
      indexByDay.set(key, dayGroups.length);
      dayGroups.push({ key, events: [] });
    }
    dayGroups[indexByDay.get(key)!].events.push(event);
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((group) => (
        <div key={group.key}>
          <h5 className="mb-2 border-b-2 border-divider pb-1.5 text-sm font-bold text-primary-dark">
            {format(group.events[0].date, "EEEE, MMM d, yyyy")}
          </h5>

          <div className="erows-scroll">
            <div className="erows" style={{ "--erow-cols": tracks } as React.CSSProperties}>
            <div className="erow-head">
              {scored && <div>Game</div>}
              <div>Home</div>
              {scored && <div className="text-center">Score</div>}
              <div>Away</div>
              {scored && <div className="text-center">Score</div>}
              {usesSetScores && <div>Sets</div>}
              {showDivisionTag && <div>Division</div>}
              <div>Time</div>
              <div>Court</div>
              {customFields.map((f) => (
                <div key={f.id}>{f.label}</div>
              ))}
              {showWatch && (
                <>
                  <div>Status</div>
                  <div>Watch</div>
                </>
              )}
            </div>

            {group.events.map((event) => {
              const home = event.participants.find((p) => p.isHome);
              const away = event.participants.find((p) => !p.isHome);
              // A meet session never sets any of these source fields; a team
              // game does, even before either side has a concrete school
              // (e.g. both sides still pending on a group stage).
              const hasMatchup = Boolean(
                home ||
                  away ||
                  event.homeSourceOutcome ||
                  event.awaySourceOutcome ||
                  event.homeSourceStanding ||
                  event.awaySourceStanding ||
                  event.homeSourceLabel ||
                  event.awaySourceLabel
              );
              const homeScore = home && event.results.find((r) => r.schoolId === home.schoolId)?.score;
              const awayScore = away && event.results.find((r) => r.schoolId === away.schoolId)?.score;
              const valueByFieldId = new Map(event.fieldValues.map((v) => [v.fieldId, v.value]));

              return (
                <article key={event.id} className="erow">
                  {scored && (
                    <div className="espan text-xs text-muted sm:text-sm">
                      <span className="elabel">Game</span>
                      <Link href={eventHref(event.slug)} className="hover:text-primary">
                        {event.externalId ?? "—"}
                      </Link>
                    </div>
                  )}

                  {hasMatchup ? (
                    <>
                      {/* Below sm these four cells fall into the 1fr|auto grid
                          as two school/score lines; at sm+ they are four
                          separate columns. */}
                      <div className={`font-extrabold ${scored ? "" : "espan"}`}>
                        <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 hover:text-primary">
                          <Side
                            participant={home}
                            outcome={event.homeSourceOutcome}
                            sourceExternalId={event.homeSourceEvent?.externalId}
                            sourceStanding={event.homeSourceStanding}
                            sourceLabel={event.homeSourceLabel}
                          />
                        </Link>
                      </div>
                      {scored && (
                        <div className="text-right font-extrabold tabular-nums sm:text-center sm:font-normal">
                          {homeScore ?? "—"}
                        </div>
                      )}
                      <div className={`font-extrabold ${scored ? "" : "espan"}`}>
                        <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 hover:text-primary">
                          <Side
                            participant={away}
                            outcome={event.awaySourceOutcome}
                            sourceExternalId={event.awaySourceEvent?.externalId}
                            sourceStanding={event.awaySourceStanding}
                            sourceLabel={event.awaySourceLabel}
                          />
                        </Link>
                      </div>
                      {scored && (
                        <div className="text-right font-extrabold tabular-nums sm:text-center sm:font-normal">
                          {awayScore ?? "—"}
                        </div>
                      )}
                    </>
                  ) : (
                    // A meet session has no two-school matchup, so its title
                    // takes the space both school columns would have used.
                    <div className="espan font-extrabold sm:col-span-2">
                      <Link href={eventHref(event.slug)} className="hover:text-primary">
                        {event.title ?? "Untitled session"}
                      </Link>
                    </div>
                  )}

                  <div className="emeta">
                    {usesSetScores && (
                      <div className="whitespace-nowrap">
                        <span className="elabel">Sets</span>
                        {event.sets.length > 0
                          ? event.sets.map((s) => `${s.homeScore}-${s.awayScore}`).join(", ")
                          : "—"}
                      </div>
                    )}
                    {showDivisionTag && (
                      <div>
                        {event.division ? (
                          <span className={`tag ${divisionTagClass(event.division.name)}`}>{event.division.name}</span>
                        ) : (
                          "—"
                        )}
                      </div>
                    )}
                    <div className="whitespace-nowrap tabular-nums">
                      <span className="elabel">Time</span>
                      {format(event.date, "h:mm a")}
                    </div>
                    <div>
                      <span className="elabel">Court</span>
                      {event.location ?? "—"}
                    </div>
                    {customFields.map((f) => (
                      <div key={f.id}>
                        <span className="elabel">{f.label}</span>
                        {valueByFieldId.get(f.id) ?? "—"}
                      </div>
                    ))}
                    {showWatch && (
                      <>
                        <div>
                          <StatusTag status={event.status} />
                        </div>
                        <div>
                          {event.streamUrl && event.status === "SCHEDULED" ? (
                            <a
                              href={event.streamUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tag tag-accent inline-flex gap-1"
                            >
                              <LiveIcon />
                              Watch live
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

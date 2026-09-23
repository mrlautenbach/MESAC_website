import { Fragment } from "react";
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
    school: {
      name: string;
      code: string | null;
      logoUrl: string | null;
      themeColor: string | null;
      themeColorSecondary: string | null;
    };
  }[];
  results: { schoolId: string; score: number | null; outcome?: string | null }[];
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

type Columns = {
  game: boolean;
  score: boolean;
  sets: boolean;
  division: boolean;
  court: boolean;
  fields: { id: string; label: string }[];
  status: boolean;
  watch: boolean;
};

// Only the columns that have something to show for this list - e.g. no
// empty Score/Sets columns on a list of games that haven't been played yet.
function visibleColumns(props: EventRowsProps): Columns {
  const { events, scoringType, usesSetScores, showDivisionTag, showWatch, customFields } = props;
  const scored = scoringType !== "NONE";
  return {
    game: scored && events.some((e) => e.externalId),
    score: scored && events.some((e) => e.results.some((r) => r.score !== null)),
    sets: usesSetScores && events.some((e) => e.sets.length > 0),
    division: showDivisionTag,
    court: events.some((e) => e.location),
    fields: customFields.filter((f) => events.some((e) => e.fieldValues.some((v) => v.fieldId === f.id && v.value))),
    status: showWatch,
    watch: showWatch && events.some((e) => e.streamUrl && e.status === "SCHEDULED"),
  };
}

/** Column track widths, in the order the cells are emitted. Only the columns
 *  actually rendered are included, so the header and every row agree. */
function columnTracks(cols: Columns) {
  return [
    cols.game && "minmax(3.5rem, auto)",
    "minmax(11rem, 1.4fr)", // Home
    cols.score && "3.5rem",
    "minmax(11rem, 1.4fr)", // Away
    cols.score && "3.5rem",
    cols.sets && "max-content",
    cols.division && "max-content",
    "max-content", // Time
    cols.court && "max-content",
    ...cols.fields.map(() => "max-content"),
    cols.status && "max-content",
    cols.watch && "max-content",
  ]
    .filter(Boolean)
    .join(" ");
}

// Long names ("American Embassy School, New Delhi, India") wrap onto two
// lines in the table, so once any name in the list is that long, every
// school with a short code uses it - all or nothing, so a column never mixes
// "ACS" with "American School of Doha". The badge and hover title still carry
// the full name, and cards on phones always show it.
const LONG_NAME = 24;

function Side({
  participant,
  outcome,
  sourceExternalId,
  sourceStanding,
  sourceLabel,
  useCodes,
}: {
  participant: EventRowEvent["participants"][number] | undefined;
  outcome: "WINNER" | "LOSER" | null;
  sourceExternalId: string | null | undefined;
  sourceStanding: number | null;
  sourceLabel: string | null;
  useCodes: boolean;
}) {
  const label = sideLabel(participant, outcome, sourceExternalId, sourceStanding, sourceLabel);
  const short = useCodes && participant?.school.code ? participant.school.code : null;
  return (
    <>
      <SchoolBadge
        size={36}
        logoUrl={participant?.school.logoUrl}
        name={participant?.school.name ?? "TBD"}
        color={participant?.school.themeColor}
        secondaryColor={participant?.school.themeColorSecondary}
      />
      {short ? (
        <>
          <span className="sm:hidden">{label}</span>
          <span className="hidden sm:inline" title={label}>
            {short}
          </span>
        </>
      ) : (
        label
      )}
    </>
  );
}

// Which side won, from the recorded outcome - or, failing that, the scores
// (lowest wins for LOW_SCORE). Null while undecided or tied.
function winnerSchoolId(event: EventRowEvent, scoringType: EventRowsProps["scoringType"]): string | null {
  if (event.status !== "COMPLETED") return null;
  const byOutcome = event.results.find((r) => r.outcome === "WIN");
  if (byOutcome) return byOutcome.schoolId;
  const scored = event.results.filter((r) => r.score !== null);
  if (scored.length !== 2 || scored[0].score === scored[1].score) return null;
  const [a, b] = scored as { schoolId: string; score: number }[];
  const aWins = scoringType === "LOW_SCORE" ? a.score < b.score : a.score > b.score;
  return aWins ? a.schoolId : b.schoolId;
}

export function EventRows(props: EventRowsProps) {
  const { events, tournamentSlug, scoringType } = props;
  const eventHref = (slug: string) => `/seasons/${tournamentSlug}/events/${slug}`;
  const cols = visibleColumns(props);
  const tracks = columnTracks(cols);
  const useCodes = events.some((e) => e.participants.some((p) => p.school.name.length > LONG_NAME && p.school.code));

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
    <div className="erows-scroll">
      <div className="erows" style={{ "--erow-cols": tracks } as React.CSSProperties}>
        <div className="erow-head">
          {cols.game && <div>Game</div>}
          <div>Home</div>
          {cols.score && <div className="text-center">Score</div>}
          <div>Away</div>
          {cols.score && <div className="text-center">Score</div>}
          {cols.sets && <div>Sets</div>}
          {cols.division && <div>Division</div>}
          <div>Time</div>
          {cols.court && <div>Court</div>}
          {cols.fields.map((f) => (
            <div key={f.id}>{f.label}</div>
          ))}
          {cols.status && <div>Status</div>}
          {cols.watch && <div>Watch</div>}
        </div>

        {dayGroups.map((group) => (
          <Fragment key={group.key}>
            <h5 className="col-span-full pb-1.5 pt-4 text-sm font-bold text-primary-dark first-of-type:pt-3 sm:border-b sm:border-divider">
              {format(group.events[0].date, "EEEE, MMM d, yyyy")}
            </h5>

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
              const winner = winnerSchoolId(event, scoringType);
              // The losing side reads quieter once a game has a winner.
              const tone = (schoolId: string | undefined) => (winner && schoolId !== winner ? "text-muted" : "");
              const valueByFieldId = new Map(event.fieldValues.map((v) => [v.fieldId, v.value]));

              return (
                <article key={event.id} className="erow">
                  {cols.game && (
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
                      <div className={`font-extrabold ${cols.score ? "" : "espan"} ${tone(home?.schoolId)}`}>
                        <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 hover:text-primary">
                          <Side
                            participant={home}
                            outcome={event.homeSourceOutcome}
                            sourceExternalId={event.homeSourceEvent?.externalId}
                            sourceStanding={event.homeSourceStanding}
                            sourceLabel={event.homeSourceLabel}
                            useCodes={useCodes}
                          />
                        </Link>
                      </div>
                      {cols.score && (
                        <div className={`text-right font-extrabold tabular-nums sm:text-center ${tone(home?.schoolId)}`}>
                          {homeScore ?? "—"}
                        </div>
                      )}
                      <div className={`font-extrabold ${cols.score ? "" : "espan"} ${tone(away?.schoolId)}`}>
                        <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 hover:text-primary">
                          <Side
                            participant={away}
                            outcome={event.awaySourceOutcome}
                            sourceExternalId={event.awaySourceEvent?.externalId}
                            sourceStanding={event.awaySourceStanding}
                            sourceLabel={event.awaySourceLabel}
                            useCodes={useCodes}
                          />
                        </Link>
                      </div>
                      {cols.score && (
                        <div className={`text-right font-extrabold tabular-nums sm:text-center ${tone(away?.schoolId)}`}>
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
                    {cols.sets && (
                      <div className="whitespace-nowrap">
                        <span className="elabel">Sets</span>
                        {event.sets.length > 0
                          ? event.sets.map((s) => `${s.homeScore}-${s.awayScore}`).join(", ")
                          : "—"}
                      </div>
                    )}
                    {cols.division && (
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
                    {cols.court && (
                      <div>
                        <span className="elabel">Court</span>
                        {event.location ?? "—"}
                      </div>
                    )}
                    {cols.fields.map((f) => (
                      <div key={f.id}>
                        <span className="elabel">{f.label}</span>
                        {valueByFieldId.get(f.id) ?? "—"}
                      </div>
                    ))}
                    {cols.status && (
                      <div>
                        <StatusTag status={event.status} />
                      </div>
                    )}
                    {cols.watch && (
                      <>
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
          </Fragment>
        ))}
      </div>
    </div>
  );
}

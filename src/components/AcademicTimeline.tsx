import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  RUN_BY_FIELD,
  formatTimeRange,
  sortDivisions,
  timelineDays,
  type TimelineItem,
} from "@/lib/academicGames";

// Academic Games' schedule, day by day. With both tracks showing, items for
// every team are full-width rows and the Varsity and JV items between them
// sit side by side (stacked on phones); with one division chosen it's a
// single list of that team's competitions plus the shared ones.

async function loadItems(tournamentId: string) {
  const [events, divisions] = await Promise.all([
    prisma.event.findMany({
      where: { tournamentId, status: { not: "CANCELLED" } },
      include: { fieldValues: { where: { field: { key: RUN_BY_FIELD.key } } } },
    }),
    prisma.division.findMany({ where: { tournamentId } }),
  ]);
  const items: TimelineItem[] = events.map((e) => ({
    id: e.id,
    title: e.title ?? "Competition",
    start: e.date,
    end: e.endDate,
    venue: e.location,
    runBy: e.fieldValues[0]?.value ?? null,
    divisionId: e.divisionId,
  }));
  return { items, divisions: sortDivisions(divisions) };
}

function Item({ item, tag }: { item: TimelineItem; tag?: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 py-2.5">
      <div className="whitespace-nowrap text-sm font-extrabold tabular-nums">{formatTimeRange(item.start, item.end)}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{item.title}</span>
          {tag && <span className="tag tag-neutral">{tag}</span>}
        </div>
        <div className="text-sm text-muted">
          {item.venue ?? "Venue TBC"}
          {item.runBy && ` · run by ${item.runBy}`}
        </div>
      </div>
    </div>
  );
}

export async function AcademicTimeline({ tournamentId, divisionId }: { tournamentId: string; divisionId?: string | null }) {
  const { items, divisions } = await loadItems(tournamentId);
  const shown = divisionId ? items.filter((i) => !i.divisionId || i.divisionId === divisionId) : items;
  if (shown.length === 0) return <p className="text-sm text-muted">The schedule hasn&apos;t been posted yet.</p>;

  const nameOf = new Map(divisions.map((d) => [d.id, d.name]));
  const days = timelineDays(shown, divisionId ? divisions.filter((d) => d.id === divisionId) : divisions);

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.key}>
          <h5 className="mb-2">{format(day.date, "EEEE d MMMM")}</h5>
          <ol className="divide-y divide-divider border-y border-divider">
            {day.blocks.map((block) =>
              block.kind === "shared" ? (
                <li key={block.item.id}>
                  <Item item={block.item} tag={divisions.length > 1 ? "All teams" : undefined} />
                </li>
              ) : divisionId ? (
                // One track: its items are just rows in the list.
                block.columns[0].items.map((item) => (
                  <li key={item.id}>
                    <Item item={item} />
                  </li>
                ))
              ) : (
                <li
                  key={block.columns.flatMap((c) => c.items.map((i) => i.id)).join("-")}
                  className="grid gap-x-8 py-1 sm:grid-cols-2"
                >
                  {block.columns.map((column) => (
                    <div key={column.divisionId} className="border-divider pt-2 max-sm:not-first:border-t sm:pt-0">
                      <h6 className="pt-2 text-muted">{nameOf.get(column.divisionId)}</h6>
                      {column.items.length > 0 ? (
                        <ul className="divide-y divide-divider/60">
                          {column.items.map((item) => (
                            <li key={item.id}>
                              <Item item={item} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="py-2.5 text-sm text-muted">No competition</p>
                      )}
                    </div>
                  ))}
                </li>
              )
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}

// The tournament page's "Coming up": the next few competitions across both
// tracks, each marked with its team.
export async function AcademicUpNext({ tournamentId, limit = 5 }: { tournamentId: string; limit?: number }) {
  const { items, divisions } = await loadItems(tournamentId);
  const now = new Date();
  const rank = (i: TimelineItem) => (i.divisionId ? divisions.findIndex((d) => d.id === i.divisionId) + 1 : 0);
  const next = items
    .filter((i) => (i.end ?? i.start) >= now)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || rank(a) - rank(b))
    .slice(0, limit);
  if (next.length === 0) return <p className="text-muted">Nothing else is scheduled right now.</p>;

  const nameOf = new Map(divisions.map((d) => [d.id, d.name]));
  return (
    <ol className="divide-y divide-divider border-y border-divider">
      {next.map((item) => (
        <li key={item.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
          <div className="py-2.5 text-sm text-muted">{format(item.start, "EEE d MMM")}</div>
          <Item item={item} tag={item.divisionId ? nameOf.get(item.divisionId) : divisions.length > 1 ? "All teams" : undefined} />
        </li>
      ))}
    </ol>
  );
}

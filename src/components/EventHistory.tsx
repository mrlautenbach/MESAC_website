import { formatDistanceToNow } from "date-fns";
import { revertAuditEntryAction } from "@/lib/actions/events";

type Entry = {
  id: string;
  actorLabel: string;
  summary: string;
  createdAt: Date;
  entityType: string;
  beforeJson: unknown;
};

export function EventHistory({ entries, isAdmin }: { entries: Entry[]; isAdmin: boolean }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No edits yet.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
          <div>
            <span className="font-medium">{entry.summary}</span>{" "}
            <span className="text-muted">· {formatDistanceToNow(entry.createdAt, { addSuffix: true })}</span>
          </div>
          {isAdmin && (entry.entityType === "Event" || entry.entityType === "Result") && entry.beforeJson != null && (
            <form
              action={async () => {
                "use server";
                await revertAuditEntryAction(entry.id);
              }}
            >
              <button type="submit" className="btn btn-secondary px-2 py-1 text-xs">
                Revert to this
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

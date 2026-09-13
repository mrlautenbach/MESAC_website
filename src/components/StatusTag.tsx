// Lives in its own module so EventRows and the pages that embed it can share
// one definition without importing each other in a cycle.
const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "tag-accent",
  COMPLETED: "tag-neutral",
  CANCELLED: "tag-outline",
};

export function StatusTag({ status }: { status: string }) {
  return <span className={`tag ${STATUS_STYLES[status] ?? "tag-neutral"}`}>{status}</span>;
}

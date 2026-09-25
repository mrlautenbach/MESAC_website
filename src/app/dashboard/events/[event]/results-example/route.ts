import { getCurrentUser } from "@/lib/session";
import { buildMeetResultsExample } from "@/lib/meetResultsExample";

// GET /dashboard/events/<id>/results-example
// Serves the example meet results CSV for one session (see lib/meetResultsExample).
export async function GET(_request: Request, { params }: { params: Promise<{ event: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed.", { status: 403 });

  const { event } = await params;
  const example = await buildMeetResultsExample(event);
  if (!example) return new Response("Meet session not found.", { status: 404 });

  return new Response(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

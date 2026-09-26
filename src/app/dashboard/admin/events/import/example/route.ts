import { getCurrentUser } from "@/lib/session";
import { buildGameScheduleExample } from "@/lib/scheduleExamples";

// GET /dashboard/admin/events/import/example?tournament=<id>
// The example games-schedule CSV for the bulk import (see lib/scheduleExamples).
// Anyone who can use the import can download it.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not allowed.", { status: 403 });

  const example = await buildGameScheduleExample(new URL(request.url).searchParams.get("tournament") ?? "");
  if (!example) return new Response("Tournament not found.", { status: 404 });

  return new Response(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

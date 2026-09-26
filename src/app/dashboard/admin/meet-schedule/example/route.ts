import { getCurrentUser } from "@/lib/session";
import { buildMeetScheduleExample } from "@/lib/scheduleExamples";

// GET /dashboard/admin/meet-schedule/example?tournament=<id>
// The example meet schedule & program CSV (see lib/scheduleExamples).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed.", { status: 403 });

  const example = await buildMeetScheduleExample(new URL(request.url).searchParams.get("tournament") ?? "");
  if (!example) return new Response("Meet tournament not found.", { status: 404 });

  return new Response(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

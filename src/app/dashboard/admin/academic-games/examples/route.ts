import { getCurrentUser } from "@/lib/session";
import { buildAcademicScheduleExample, buildBowlExample, buildChallengeExample } from "@/lib/academicExamples";

// GET /dashboard/admin/academic-games/examples?tournament=<id>&file=schedule|bowl|challenges
// Serves an example CSV for the Academic Games uploads (see lib/academicExamples).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed.", { status: 403 });

  const url = new URL(request.url);
  const file = url.searchParams.get("file") ?? "schedule";
  const builders = { schedule: buildAcademicScheduleExample, bowl: buildBowlExample, challenges: buildChallengeExample };
  if (!(file in builders)) return new Response("Unknown example file.", { status: 400 });
  const example = await builders[file as keyof typeof builders](url.searchParams.get("tournament") ?? "");
  if (!example) return new Response("Academic Games tournament not found.", { status: 404 });

  return new Response(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

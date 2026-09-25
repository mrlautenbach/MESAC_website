import { getCurrentUser } from "@/lib/session";
import { buildAcademicScheduleExample } from "@/lib/academicExamples";

// GET /dashboard/admin/academic-games/examples?tournament=<id>
// Serves the example schedule CSV for the Academic Games upload (see lib/academicExamples).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed.", { status: 403 });

  const example = await buildAcademicScheduleExample(new URL(request.url).searchParams.get("tournament") ?? "");
  if (!example) return new Response("Academic Games tournament not found.", { status: 404 });

  return new Response(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

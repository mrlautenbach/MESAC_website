import { getCurrentUser } from "@/lib/session";
import { buildGolfExample, GOLF_EXAMPLE_FILES, type GolfExampleFile } from "@/lib/golfExamples";

// GET /dashboard/admin/golf/examples?tournament=<id>&file=roster|draw|scores|team-draw|team-results
// Serves one example CSV for the Golf page's uploads (see lib/golfExamples).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed.", { status: 403 });

  const url = new URL(request.url);
  const file = url.searchParams.get("file") as GolfExampleFile | null;
  if (!file || !GOLF_EXAMPLE_FILES.includes(file)) return new Response("Unknown example file.", { status: 400 });

  const example = await buildGolfExample(url.searchParams.get("tournament") ?? "", file);
  if (!example) return new Response("Golf tournament not found.", { status: 404 });

  return new Response(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

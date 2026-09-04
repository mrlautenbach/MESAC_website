import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseYearParam(param: string): number | null {
  const match = param.match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) return null;
  return start;
}

export default async function SchoolYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const startYear = parseYearParam(year);
  if (startYear === null) notFound();

  const archive = await prisma.schoolYearArchive.findUnique({ where: { startYear } });
  if (!archive) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/records" className="text-sm font-semibold text-primary-dark hover:underline">
        &larr; History
      </Link>
      <h6 className="mt-4 text-primary-dark">School year</h6>
      <h1 className="mt-2 mb-6 text-4xl sm:text-5xl">
        {startYear}-{startYear + 1}
      </h1>

      {archive.resultsUrl ? (
        <a href={archive.resultsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          View {startYear}-{startYear + 1} results &rarr;
        </a>
      ) : (
        <p className="text-muted">Results for this school year haven&apos;t been added yet.</p>
      )}
    </div>
  );
}

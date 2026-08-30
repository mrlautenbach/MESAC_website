import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { RecordForm } from "@/components/RecordForm";
import { HallOfFameForm } from "@/components/HallOfFameForm";
import { deleteRecordAction, deleteHallOfFameAction } from "@/lib/actions/records";

export default async function RecordsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [schools, records, hofEntries] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: "asc" } }),
    prisma.record.findMany({ orderBy: [{ sport: "asc" }, { eventName: "asc" }], include: { school: true } }),
    prisma.hallOfFameEntry.findMany({ orderBy: { classYear: "desc" }, include: { school: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold">Add a league record</h1>
        <RecordForm schools={schools} />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">Records ({records.length})</h2>
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="text-sm">
                <span className="font-semibold">
                  {r.sport} · {r.eventName}
                </span>{" "}
                — {r.mark} · {r.athleteName}
                {r.school && ` (${r.school.name})`} · {r.year}
              </div>
              <form
                action={async () => {
                  "use server";
                  await deleteRecordAction(r.id);
                }}
              >
                <button type="submit" className="btn btn-danger px-2 py-1 text-xs">
                  Delete
                </button>
              </form>
            </li>
          ))}
          {records.length === 0 && <p className="text-muted">No records yet.</p>}
        </ul>
      </div>

      <div>
        <h1 className="mb-6 text-2xl font-bold">Add a Hall of Fame inductee</h1>
        <HallOfFameForm schools={schools} />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">Hall of Fame ({hofEntries.length})</h2>
        <ul className="space-y-2">
          {hofEntries.map((h) => (
            <li key={h.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="text-sm">
                <span className="font-semibold">{h.name}</span> · Class of {h.classYear}
                {h.school && ` · ${h.school.name}`}
              </div>
              <form
                action={async () => {
                  "use server";
                  await deleteHallOfFameAction(h.id);
                }}
              >
                <button type="submit" className="btn btn-danger px-2 py-1 text-xs">
                  Delete
                </button>
              </form>
            </li>
          ))}
          {hofEntries.length === 0 && <p className="text-muted">No inductees yet.</p>}
        </ul>
      </div>
    </div>
  );
}

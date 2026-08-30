import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function AuditLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Audit log</h1>
      <p className="mb-4 text-sm text-muted">
        Every create, edit, and delete of results, photos, and accounts. This list is append-only and cannot be
        edited or removed from within the app.
      </p>
      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {format(entry.createdAt, "MMM d, yyyy h:mm a")}
                </td>
                <td className="px-3 py-2">{entry.actorLabel}</td>
                <td className="px-3 py-2">
                  <code className="text-xs">{entry.action}</code>
                </td>
                <td className="px-3 py-2">{entry.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

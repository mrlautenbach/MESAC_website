import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SchoolForm } from "@/components/SchoolForm";

export default async function SchoolsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="page-wrap space-y-10 py-8 [&>*]:max-w-3xl">
      <div>
        <h1 className="mb-4 text-2xl">Schools ({schools.length})</h1>
        <ul className="card divide-y divide-border">
          {schools.map((school) => (
            <li key={school.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-foreground/[.04]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-white">
                    {school.logoUrl ? (
                      <Image src={school.logoUrl} alt="" width={32} height={32} className="max-h-8 w-auto object-contain" />
                    ) : (
                      <span className="text-[10px] font-bold text-muted">{school.code ?? ""}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{school.name}</span>
                    <span className="block text-xs text-muted">
                      {[school.code, school.city].filter(Boolean).join(" · ") || "No code or city yet"}
                    </span>
                  </span>
                  {!school.isLeagueMember && <span className="tag tag-neutral">Guest</span>}
                  <span className="text-sm font-semibold text-primary group-open:hidden">Edit</span>
                  <span className="hidden text-sm font-semibold text-muted group-open:inline">Close</span>
                </summary>
                <div className="border-t border-border px-4 py-5">
                  <SchoolForm
                    existing={{
                      id: school.id,
                      name: school.name,
                      contactName: school.contactName,
                      contactEmail: school.contactEmail,
                      contactPhone: school.contactPhone,
                      code: school.code,
                      city: school.city,
                      lat: school.lat,
                      lon: school.lon,
                      themeColor: school.themeColor,
                      themeColorSecondary: school.themeColorSecondary,
                      teamCount: school.teamCount,
                      isLeagueMember: school.isLeagueMember,
                    }}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>

      <details className="card group p-4">
        <summary className="cursor-pointer list-none font-semibold text-primary">
          <span className="group-open:hidden">+ Add a school</span>
          <span className="hidden text-foreground group-open:inline">Add a school</span>
        </summary>
        <div className="mt-4">
          <SchoolForm />
        </div>
      </details>
    </div>
  );
}

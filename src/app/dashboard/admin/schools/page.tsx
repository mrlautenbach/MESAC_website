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
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold">Add a school</h1>
        <SchoolForm />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">Schools ({schools.length})</h2>
        <div className="space-y-6">
          {schools.map((school) => (
            <details key={school.id} className="card p-4">
              <summary className="flex cursor-pointer items-center gap-3 font-semibold">
                {school.logoUrl && (
                  <Image src={school.logoUrl} alt="" width={32} height={32} className="rounded" />
                )}
                {school.name}
              </summary>
              <div className="mt-4">
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
                  }}
                />
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

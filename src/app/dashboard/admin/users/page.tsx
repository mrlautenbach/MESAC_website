import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "@/components/CreateUserForm";
import { UserRow } from "@/components/UserRow";

export default async function UsersAdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");

  const [users, schools] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], include: { school: true } }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold">Create an account</h1>
        <CreateUserForm schools={schools} />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">Accounts ({users.length})</h2>
        <ul className="space-y-3">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={{
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                schoolName: u.school?.name ?? null,
                isDisabled: u.isDisabled,
                isSelf: u.id === currentUser.id,
              }}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

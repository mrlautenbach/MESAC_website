import { getCurrentUser } from "@/lib/session";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Signed-out visitors are redirected by each page; someone who still has
  // to set their own password shouldn't be offered anywhere else to go.
  const showNav = user && !user.mustChangePassword;

  return (
    <>
      {showNav && <DashboardNav isAdmin={user.role === "ADMIN"} />}
      {children}
    </>
  );
}

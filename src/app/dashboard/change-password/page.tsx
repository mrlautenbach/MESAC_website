import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold">Change password</h1>
      <ChangePasswordForm />
    </div>
  );
}

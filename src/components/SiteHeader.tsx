import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { NavLinks } from "@/components/NavLinks";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="mnav bg-background">
      <Link href="/" className="mr-auto flex items-baseline gap-2.5">
        <span className="text-lg font-extrabold tracking-tight">MESAC</span>
        <span className="hidden text-[10px] font-normal uppercase tracking-[0.14em] text-muted sm:inline">
          Middle East South Asian Conference
        </span>
      </Link>
      <nav className="flex items-center gap-5">
        <NavLinks />
      </nav>
      <div className="ml-2">
        {user ? (
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm hover:text-primary">
              Dashboard
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-secondary">
                Log out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="btn btn-primary">
            Editor / Admin login
          </Link>
        )}
      </div>
    </header>
  );
}

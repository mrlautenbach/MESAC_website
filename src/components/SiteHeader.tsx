import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { NavLinks } from "@/components/NavLinks";
import { MobileMenu } from "@/components/MobileMenu";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="mnav bg-background">
      <Link href="/" className="mr-auto flex shrink-0 items-center gap-2.5">
        <Image src="/mesac-logo.png" alt="MESAC" width={36} height={36} className="h-9 w-9 object-contain" priority />
        <span className="flex items-baseline gap-2.5">
          <span className="text-lg font-extrabold tracking-tight">MESAC</span>
          <span className="hidden text-[11px] font-normal uppercase tracking-[0.14em] text-muted lg:inline">
            Middle East South Asian Conference
          </span>
        </span>
      </Link>
      <nav className="hidden items-center gap-5 sm:flex">
        <NavLinks />
      </nav>
      <div className="ml-2 hidden items-center gap-4 sm:flex">
        {user ? (
          <>
            <Link href="/dashboard" className="text-sm hover:text-primary">
              Dashboard
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-muted hover:text-primary">
                Log out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="text-muted">
            Log in
          </Link>
        )}
      </div>
      <MobileMenu signedIn={!!user} />
    </header>
  );
}

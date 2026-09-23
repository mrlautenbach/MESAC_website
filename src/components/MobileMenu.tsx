"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLinks } from "@/components/NavLinks";
import { logoutAction } from "@/lib/actions/auth";

export function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  // Following a link should close the menu, not leave it covering the new page.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        className="-mr-2 flex h-10 w-10 items-center justify-center sm:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? <path d="M5 5l12 12M17 5L5 17" /> : <path d="M3 6h16M3 11h16M3 16h16" />}
        </svg>
      </button>

      <div id={panelId} hidden={!open} className="basis-full sm:hidden">
        <nav className="flex flex-col border-t border-divider pt-2 [&>a]:py-2.5 [&>a]:text-base">
          <NavLinks />
          {signedIn ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <form action={logoutAction}>
                <button type="submit" className="py-2.5 text-base text-muted">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-muted">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}

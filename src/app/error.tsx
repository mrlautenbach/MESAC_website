"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page fails to load (e.g. the database is briefly
// unreachable), in place of Next's unbranded error screen.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-wrap py-16">
      <p className="eyebrow text-primary-dark">Something went wrong</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">This page didn&apos;t load.</h1>
      <p className="mt-4 max-w-[52ch] text-muted">
        It&apos;s usually a brief problem - try again in a moment.
        {error.digest && <span className="mt-2 block text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Home
        </Link>
      </div>
    </div>
  );
}

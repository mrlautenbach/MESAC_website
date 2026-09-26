import Link from "next/link";

export const metadata = { title: "Page not found" };

// Shown for any address that doesn't match a page - or a tournament, game
// or school that no longer exists.
export default function NotFound() {
  return (
    <div className="page-wrap py-16">
      <p className="eyebrow text-primary-dark">Page not found</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">That page isn&apos;t here.</h1>
      <p className="mt-4 max-w-[52ch] text-muted">
        It may have moved, or the tournament or game it showed may have been removed. Try one of these instead:
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/today" className="btn btn-primary">
          Today&apos;s games
        </Link>
        <Link href="/tournaments" className="btn btn-secondary">
          Tournaments
        </Link>
        <Link href="/" className="btn btn-secondary">
          Home
        </Link>
      </div>
    </div>
  );
}

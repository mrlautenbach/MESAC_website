import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { sideLabel } from "@/lib/eventDisplay";

const PAST_LIMIT = 20;

// Exactly the fields EventRow renders - the previous `include`s pulled whole
// School, Tournament, Activity and Division rows for a one-line summary.
const EVENT_ROW = {
  id: true,
  slug: true,
  date: true,
  location: true,
  status: true,
  title: true,
  homeSourceOutcome: true,
  awaySourceOutcome: true,
  homeSourceStanding: true,
  awaySourceStanding: true,
  homeSourceLabel: true,
  awaySourceLabel: true,
  homeSourceEvent: { select: { externalId: true } },
  awaySourceEvent: { select: { externalId: true } },
  division: { select: { name: true } },
  tournament: { select: { name: true, slug: true, activity: { select: { name: true } } } },
  participants: { select: { isHome: true, school: { select: { name: true } } } },
} as const;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.mustChangePassword) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="mb-2 text-2xl font-bold">Welcome, {user.name}</h1>
        <p className="mb-6 text-muted">
          For security, please set your own password before continuing.
        </p>
        <ChangePasswordForm />
      </div>
    );
  }

  const now = new Date();
  const scope = user.role === "ADMIN" ? {} : { participants: { some: { schoolId: user.schoolId ?? "" } } };
  // Split by date in the query rather than loading every event ever played
  // and filtering in memory - for an admin the unscoped version grows with
  // the whole league's history to render, at most, twenty past rows.
  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: { ...scope, date: { gte: now } },
      orderBy: { date: "asc" },
      select: EVENT_ROW,
    }),
    prisma.event.findMany({
      where: { ...scope, date: { lt: now } },
      orderBy: { date: "desc" },
      take: PAST_LIMIT,
      select: EVENT_ROW,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
          <p className="text-muted">
            {user.role === "ADMIN" ? "League admin" : "School editor"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/events/new" className="btn btn-primary">
            + New event
          </Link>
          <Link href="/dashboard/admin/tournaments" className="btn btn-secondary">
            Tournaments
          </Link>
          {user.role === "ADMIN" && (
            <>
              <Link href="/dashboard/admin/schools" className="btn btn-secondary">
                Schools
              </Link>
              <Link href="/dashboard/admin/records" className="btn btn-secondary">
                History
              </Link>
              <Link href="/dashboard/admin/users" className="btn btn-secondary">
                Accounts
              </Link>
              <Link href="/dashboard/admin/audit-log" className="btn btn-secondary">
                Audit log
              </Link>
            </>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted">No upcoming events.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Past</h2>
        {past.length === 0 ? (
          <p className="text-muted">No past events yet.</p>
        ) : (
          <ul className="space-y-2">
            {past.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type EventRowProps = {
  event: {
    id: string;
    slug: string;
    date: Date;
    location: string | null;
    status: string;
    title: string | null;
    tournament: { name: string; slug: string; activity: { name: string } };
    division: { name: string } | null;
    participants: { isHome: boolean; school: { name: string } }[];
    homeSourceOutcome: "WINNER" | "LOSER" | null;
    awaySourceOutcome: "WINNER" | "LOSER" | null;
    homeSourceStanding: number | null;
    awaySourceStanding: number | null;
    homeSourceLabel: string | null;
    awaySourceLabel: string | null;
    homeSourceEvent: { externalId: string | null } | null;
    awaySourceEvent: { externalId: string | null } | null;
  };
};

function EventRow({ event }: EventRowProps) {
  // A meet session never sets any of these source fields; a team game does,
  // even before either side has a concrete school (e.g. both still pending).
  const isPendingDualMatchup =
    event.homeSourceOutcome ||
    event.awaySourceOutcome ||
    event.homeSourceStanding ||
    event.awaySourceStanding ||
    event.homeSourceLabel ||
    event.awaySourceLabel;
  const matchup =
    event.participants.length === 0 && !isPendingDualMatchup
      ? event.title ?? "Untitled session"
      : event.participants.length <= 2
      ? `${sideLabel(
          event.participants.find((p) => p.isHome),
          event.homeSourceOutcome,
          event.homeSourceEvent?.externalId,
          event.homeSourceStanding,
          event.homeSourceLabel
        )} vs ${sideLabel(
          event.participants.find((p) => !p.isHome),
          event.awaySourceOutcome,
          event.awaySourceEvent?.externalId,
          event.awaySourceStanding,
          event.awaySourceLabel
        )}`
      : event.participants.map((p) => p.school.name).join(" vs ");
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <div className="font-semibold">{matchup}</div>
        <div className="text-sm text-muted">
          {event.tournament.activity.name}
          {event.division ? ` · ${event.division.name}` : ""} ({event.tournament.name}) ·{" "}
          {format(event.date, "EEE, MMM d, yyyy · h:mm a")}
          {event.location ? ` · ${event.location}` : ""}
        </div>
      </div>
      <Link href={`/dashboard/events/${event.id}`} className="btn btn-primary">
        Enter results / add photos
      </Link>
    </li>
  );
}

import Image from "next/image";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { InertSiteChrome } from "@/components/InertSiteChrome";

type DownSchool = { id: string; name: string; code: string | null; logoUrl: string | null; themeColor: string | null };

const NOTICE = "S1 MESAC Tournaments are not going ahead as planned";

// The home page's layout with every link removed: nothing here navigates.
export function WebsiteDown({ schools }: { schools: DownSchool[] }) {
  return (
    <div>
      <InertSiteChrome />

      {/* Poster hero */}
      <div className="relative overflow-hidden bg-brand pb-10 pt-20 text-on-ink sm:pt-24">
        <div className="lattice-band absolute inset-x-0 top-0 h-[72px] border-b-2 border-accent/70 text-accent opacity-50" />
        <div className="page-wrap relative grid gap-10 sm:grid-cols-[1.35fr_1fr] sm:items-end">
          <div>
            <p className="eyebrow text-on-ink opacity-85">Website down · Tournament update</p>
            <h1 className="mt-4 text-6xl font-extrabold leading-[.9] tracking-[-.045em] text-accent sm:text-8xl">
              See you
              <br />
              next season.
            </h1>
            <p className="mt-4 max-w-[46ch] text-base">
              The tournaments are not happening as planned this weekend. Please come back in future seasons.
            </p>
          </div>
          <div className="bg-background p-6 text-foreground">
            <h6 className="text-primary-dark">This weekend</h6>
            <p className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">S1 MESAC Tournaments are not going ahead as planned</p>
            <div className="mhr my-3" />
            <p className="text-sm text-muted">
              Fixtures, schedules and results are unavailable while the site is down. Thank you for your understanding.
            </p>
          </div>
        </div>

        <div className="page-wrap relative mt-10">
          <div className="grid grid-cols-3 gap-3 border-t border-white/15 pt-6 sm:grid-cols-6">
            {schools.map((school) => (
              <div
                key={school.id}
                title={school.name}
                className="flex h-32 flex-col items-center justify-center gap-2 border border-white/20 border-b-[3px] bg-[color-mix(in_srgb,var(--primary-tint)_16%,transparent)] px-2"
                style={school.themeColor ? { borderBottomColor: school.themeColor } : undefined}
              >
                {school.logoUrl && (
                  <span className="flex h-16 w-16 items-center justify-center bg-white p-1.5">
                    <Image src={school.logoUrl} alt="" width={64} height={64} className="max-h-full w-auto object-contain" />
                  </span>
                )}
                <span className="text-[12px] font-bold tracking-[0.1em] text-on-ink/85">
                  {school.code ?? school.name.slice(0, 3).toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker */}
      <div className="overflow-hidden border-b-2 border-divider bg-ink text-on-ink">
        <div className="ticker-track">
          {[0, 1].map((i) => (
            <div key={i} className="flex text-[12.5px] tracking-[0.04em]">
              {[0, 1, 2].map((j) => (
                <span key={j} className="whitespace-nowrap border-r border-white/20 px-6 py-2.5">
                  <span className="mr-2.5 font-extrabold text-accent">●</span>
                  {NOTICE}. Please come back in future seasons
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Notice + season calendar */}
      <div className="border-b-2 border-divider">
        <div className="page-wrap grid sm:grid-cols-[1.1fr_1fr]">
          <div className="border-b border-divider py-7 sm:border-b-0 sm:border-r-2 sm:border-divider sm:pr-7">
            <h6 className="text-primary-dark">Notice</h6>
            <h3 className="mb-2.5 mt-2.5">Please come back in future seasons</h3>
            <p className="text-sm text-muted">
              S1 MESAC Tournaments are not going ahead as planned. We look forward to welcoming
              our student-athletes, schools and supporters back for the seasons ahead.
            </p>
          </div>
          <div className="py-7 sm:pl-7">
            <h3 className="mb-2.5">Season calendar</h3>
            <p className="text-sm text-muted">Three seasons make up the MESAC year.</p>
            <div className="mhr" />
            {[1, 2, 3].map((order) => (
              <div key={order} className="flex justify-between border-b border-divider py-3 text-sm last:border-b-0">
                <span className="font-bold">Season {order}</span>
                <span className="text-muted">{SEASON_DATE_RANGES[order]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer duo */}
      <div className="page-wrap grid sm:grid-cols-[1fr_1.6fr]">
        <div className="border-b border-divider py-7 sm:border-b-0 sm:border-r-2 sm:border-divider sm:pr-7">
          <h6 className="text-primary-dark">From MESAC</h6>
          <p className="mt-2.5 text-sm text-muted">MESAC is what our student-athletes plan their year around. Thank you for your patience.</p>
        </div>
        <div className="py-7 sm:pl-7">
          <h6 className="text-primary-dark">Member schools</h6>
          <p className="mt-2.5 text-sm leading-[1.9] text-muted">{schools.map((s) => s.name).join(" · ")}</p>
        </div>
      </div>
    </div>
  );
}

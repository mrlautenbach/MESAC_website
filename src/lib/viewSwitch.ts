// The two sides some activities split Schedule and Results into, picked by
// the page's ?view= (the first side is the default, with no ?view at all):
// golf's Individual (Day 1) and Team (match play), Academic Games' Events
// (the day-by-day timeline) and Academic Bowl.
const VIEWS = {
  golf: [
    { key: "individual", label: "Individual" },
    { key: "team", label: "Team" },
  ],
  academic: [
    { key: "events", label: "Events" },
    { key: "bowl", label: "Bowl" },
  ],
};

export type ViewSwitch = { options: { key: string; label: string }[]; current: string };

export function pickView(activity: { usesGolfFormat: boolean; usesAcademicFormat: boolean }, view: string | undefined): ViewSwitch | undefined {
  const options = activity.usesGolfFormat ? VIEWS.golf : activity.usesAcademicFormat ? VIEWS.academic : null;
  if (!options) return undefined;
  return { options, current: options.some((o) => o.key === view) ? view! : options[0].key };
}

// A dual-match event's home/away slot may not be a concrete school yet - it
// can be a playoff placeholder ("winner of game G3") waiting on another
// event's result. This renders whichever is true for display.
export function sideLabel(
  participant: { school: { name: string } } | null | undefined,
  sourceOutcome: "WINNER" | "LOSER" | null | undefined,
  sourceExternalId: string | null | undefined
): string {
  if (participant) return participant.school.name;
  if (sourceOutcome) return `${sourceOutcome === "WINNER" ? "Winner" : "Loser"} of ${sourceExternalId ?? "TBD"}`;
  return "TBD";
}

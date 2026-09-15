// A number as its English ordinal - 1 -> "1st", 2 -> "2nd", 11 -> "11th",
// 22 -> "22nd", etc. Only ever fed a positive standings position here.
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// A dual-match event's home/away slot may not be a concrete school yet. It
// can be pending in three different ways, checked in this order once no
// participant has filled it:
//   - a free-text placeholder ("Local") or bare "TBD" for none
//   - a specific game's winner/loser ("WINNER(G3)")
//   - a final-standings position within the event's own division ("4th")
export function sideLabel(
  participant: { school: { name: string } } | null | undefined,
  sourceOutcome: "WINNER" | "LOSER" | null | undefined,
  sourceExternalId: string | null | undefined,
  sourceStanding?: number | null,
  sourceLabel?: string | null
): string {
  if (participant) return participant.school.name;
  if (sourceLabel) return sourceLabel;
  if (sourceOutcome) return `${sourceOutcome === "WINNER" ? "Winner" : "Loser"} of ${sourceExternalId ?? "TBD"}`;
  if (sourceStanding) return `${ordinal(sourceStanding)} place`;
  return "TBD";
}

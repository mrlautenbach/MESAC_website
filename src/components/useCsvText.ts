"use client";

import { useState } from "react";

// The pasted-CSV textarea's text, held in state. React resets a form's
// uncontrolled fields after every submit - even one that comes back with
// errors - so without this, a 50-row paste with one bad row came back
// empty. Cleared once an upload succeeds.
export function useCsvText(state: { ok: boolean } | null) {
  const [value, setValue] = useState("");
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setValue("");
  }
  return { value, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value) };
}

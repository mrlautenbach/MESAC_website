"use client";

import { useEffect } from "react";

// Makes the root layout's header and footer non-interactive while the
// website-down page is showing. `inert` also takes the links out of the tab
// order, which pointer-events alone would not.
export function InertSiteChrome() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("body > header, body > footer"));
    els.forEach((el) => el.setAttribute("inert", ""));
    return () => els.forEach((el) => el.removeAttribute("inert"));
  }, []);
  return null;
}

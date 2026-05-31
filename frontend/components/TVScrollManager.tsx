"use client";
import { useEffect } from "react";

/**
 * On webOS the d-pad moves focus but doesn't always scroll the page.
 * This component listens to every focus event and ensures the focused
 * element is scrolled into view.
 */
export default function TVScrollManager() {
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement;
      if (!el || el.tagName === "BODY") return;
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
    document.addEventListener("focusin", onFocusIn, { passive: true });
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}

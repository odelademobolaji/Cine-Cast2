"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    webOSSystem?: { platformBack: () => void };
  }
}

/**
 * Mounts once in the root layout.
 * • webOS back button (keyCode 461) → router.back() or platformBack()
 * • Registers LG media keys so the remote can control video playback
 *   (the VideoPlayer component picks these up via its own keydown listener)
 */
export default function TVBackHandler() {
  const router = useRouter();

  useEffect(() => {
    // Inform webOS that this app handles the back key itself
    if (window.webOSSystem) {
      document.addEventListener("webOSRelaunch", () => {});
    }

    function handleKey(e: KeyboardEvent) {
      if (e.keyCode === 461) {   // LG remote Back
        e.preventDefault();
        if (window.webOSSystem) {
          window.webOSSystem.platformBack();
        } else {
          router.back();
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [router]);

  return null;
}

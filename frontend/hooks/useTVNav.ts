"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const WEBOS_BACK = 461;   // LG Magic Remote back button
const TV_PLAY   = 415;
const TV_PAUSE  = 19;
const TV_TOGGLE = 179;
const TV_STOP   = 413;
const TV_REW    = 412;
const TV_FFW    = 417;

declare global {
  interface Window {
    webOSSystem?: { platformBack: () => void };
  }
}

/** Handles the webOS hardware back button on every page. */
export function useWebOSBack() {
  const router = useRouter();
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.keyCode === WEBOS_BACK) {
        e.preventDefault();
        if (window.webOSSystem) {
          window.webOSSystem.platformBack();
        } else {
          router.back();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
}

/** Returns the set of media-key codes LG remotes send. */
export const TVKeys = {
  BACK: WEBOS_BACK,
  PLAY: TV_PLAY,
  PAUSE: TV_PAUSE,
  PLAY_PAUSE: TV_TOGGLE,
  STOP: TV_STOP,
  REWIND: TV_REW,
  FAST_FORWARD: TV_FFW,
} as const;

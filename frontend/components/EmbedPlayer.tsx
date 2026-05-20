"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer from "./VideoPlayer";

export interface EmbedSource {
  name: string;
  url: string;
  unavailableReason?: string;
}

interface EmbedPlayerProps {
  title: string;
  sources: EmbedSource[];
  // When true, the iframe is loaded from our own origin (the /api/sport/embed
  // proxy) and we add allow-same-origin to the sandbox so the proxied player
  // JS can still use localStorage etc. When false (direct third-party embed),
  // we drop allow-same-origin so the sandbox ACTUALLY blocks popups — with
  // both allow-scripts AND allow-same-origin the sandbox is a no-op per spec.
  sandboxedSameOrigin?: boolean;
}

function isDirectStream(url: string): boolean {
  return url.includes(".m3u8") || url.includes(".mp4") || url.includes(".webm");
}

export default function EmbedPlayer({ title, sources, sandboxedSameOrigin = false }: EmbedPlayerProps) {
  const playableSources = useMemo(
    () => sources.filter((source) => source.url.trim().length > 0),
    [sources]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "failed">("loading");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeSource = playableSources[activeIndex] || playableSources[0];

  // Parent-window popup blocker. Freezes window.open and intercepts the
  // classic "popunder" blur-then-refocus trick.
  useEffect(() => {
    const originalOpen = window.open.bind(window);
    try {
      Object.defineProperty(window, "open", { value: () => null, writable: false, configurable: true });
    } catch {
      window.open = () => null as unknown as Window;
    }
    const handleBlur = () => { window.setTimeout(() => window.focus(), 50); };
    window.addEventListener("blur", handleBlur);
    return () => {
      try {
        Object.defineProperty(window, "open", { value: originalOpen, writable: true, configurable: true });
      } catch {
        window.open = originalOpen;
      }
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Reset load state whenever the iframe URL changes, and start a 12s
  // failure timer so a never-loading iframe shows a useful error overlay
  // instead of staring at a blank gray box.
  useEffect(() => {
    if (!activeSource) return;
    if (isDirectStream(activeSource.url)) return;
    setLoadState("loading");
    const timer = window.setTimeout(() => {
      setLoadState((s) => (s === "loading" ? "failed" : s));
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [activeSource?.url]);

  if (!activeSource) {
    return <div className="embed-empty">No embed source is configured for this title.</div>;
  }

  const sandbox = sandboxedSameOrigin
    ? "allow-scripts allow-same-origin allow-forms allow-presentation"
    : "allow-scripts allow-forms allow-presentation";

  return (
    <div className="embed-shell">
      <div className="embed-controls" aria-label="Embed source controls">
        <div className="embed-source-tabs" role="tablist" aria-label="Video sources">
          {sources.map((source) => {
            const playableIndex = playableSources.findIndex((s) => s.name === source.name);
            const isPlayable = playableIndex >= 0;
            return (
              <button
                key={source.name}
                type="button"
                className={`embed-source-tab${playableIndex === activeIndex ? " is-active" : ""}${isPlayable ? "" : " is-disabled"}`}
                onClick={() => { if (isPlayable) setActiveIndex(playableIndex); }}
                role="tab"
                aria-selected={playableIndex === activeIndex}
                aria-disabled={!isPlayable}
                disabled={!isPlayable}
                title={source.unavailableReason}
              >
                {source.name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="embed-next"
          onClick={() => setActiveIndex((activeIndex + 1) % playableSources.length)}
        >
          Try next source
        </button>
      </div>

      {isDirectStream(activeSource.url) ? (
        <div className="embed-player" style={{ background: "#000" }}>
          <VideoPlayer key={activeSource.url} src={activeSource.url} title={title} />
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <iframe
            ref={iframeRef}
            key={activeSource.url}
            className="embed-player"
            src={activeSource.url}
            title={`${title} - ${activeSource.name}`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="no-referrer"
            allowFullScreen
            sandbox={sandbox}
            onLoad={() => setLoadState("loaded")}
            onError={() => setLoadState("failed")}
          />
          {loadState === "failed" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(10,10,10,0.92)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28 }}>📡</div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
                Stream blocked or unavailable
              </div>
              <div style={{ color: "#aaa", fontSize: 13, maxWidth: 420 }}>
                Your antivirus or network filter may be blocking the source. Try another source
                tab above, switch to Direct mode, or open the stream in a new tab.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => setActiveIndex((activeIndex + 1) % playableSources.length)}
                  style={{ background: "#e50914", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  Try next source
                </button>
                <a
                  href={activeSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: "#1a1a1a", border: "1px solid #333", color: "#fff", padding: "8px 16px", borderRadius: 6, fontSize: 13, textDecoration: "none" }}
                >
                  Open externally
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

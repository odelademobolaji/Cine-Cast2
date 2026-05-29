"use client";

// Sport-only embed player. Isolated from the shared EmbedPlayer used by
// movies/TV. Renders an iframe sourced from /api/sport/embed/* which is
// served from our own origin (the proxy fetches the upstream HTML, rewrites
// every URL through /api/sport/proxy, and injects a fetch/XHR interceptor).
// Because the iframe is same-origin with our app, we can apply a strict
// sandbox without losing functionality: popups are killed at the iframe
// level, and the parent window also locks window.open as defence-in-depth.

import { useEffect, useRef, useState } from "react";

export interface SportSource {
  name: string;
  url: string;
}

interface SportEmbedPlayerProps {
  title: string;
  sources: SportSource[];
}

export default function SportEmbedPlayer({ title, sources }: SportEmbedPlayerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "failed">("loading");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeSource = sources[activeIndex] ?? sources[0];

  // Parent-window defence-in-depth against ad popups from the embed page.
  useEffect(() => {
    const origOpen = window.open.bind(window);
    try {
      Object.defineProperty(window, "open", {
        value: () => null,
        writable: false,
        configurable: true,
      });
    } catch {
      window.open = () => null as unknown as Window;
    }
    const onBlur = () =>
      window.setTimeout(() => { try { window.focus(); } catch { /* ignore */ } }, 50);
    window.addEventListener("blur", onBlur);
    return () => {
      try { Object.defineProperty(window, "open", { value: origOpen, writable: true, configurable: true }); }
      catch { window.open = origOpen; }
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Reset load state on URL change, fail after 20s with no load event.
  useEffect(() => {
    if (!activeSource) return;
    setLoadState("loading");
    const t = window.setTimeout(
      () => setLoadState((s) => (s === "loading" ? "failed" : s)),
      20000,
    );
    return () => window.clearTimeout(t);
  }, [activeSource?.url]);

  if (!activeSource) {
    return <div className="embed-empty">No stream sources available for this match.</div>;
  }

  return (
    <div className="embed-shell">
      <div className="embed-controls" aria-label="Stream source controls">
        <div className="embed-source-tabs" role="tablist" aria-label="Stream sources">
          {sources.map((source, i) => (
            <button
              key={`${source.name}-${i}`}
              type="button"
              className={`embed-source-tab${i === activeIndex ? " is-active" : ""}`}
              onClick={() => setActiveIndex(i)}
              role="tab"
              aria-selected={i === activeIndex}
            >
              {source.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="embed-next"
          onClick={() => setActiveIndex((activeIndex + 1) % sources.length)}
        >
          Try next source
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <iframe
          ref={iframeRef}
          key={activeSource.url}
          className="embed-player"
          src={activeSource.url}
          title={`${title} — ${activeSource.name}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
          allowFullScreen
          // Strict sandbox: no allow-same-origin. Safe because our /api/sport/embed
          // route serves a sanitised page from our own origin where the injected
          // interceptor handles all dynamic requests through our proxy.
          sandbox="allow-scripts allow-pointer-lock allow-presentation allow-orientation-lock"
          onLoad={() => setLoadState("loaded")}
          onError={() => setLoadState("failed")}
        />
        {loadState === "failed" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(10,10,10,0.93)",
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
              Stream unavailable
            </div>
            <div style={{ color: "#aaa", fontSize: 13, maxWidth: 400 }}>
              The upstream provider did not respond. Try a different source or HD level.
            </div>
            <button
              onClick={() => setActiveIndex((activeIndex + 1) % sources.length)}
              style={{
                background: "#e50914",
                border: "none",
                color: "#fff",
                padding: "8px 18px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Try next source
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

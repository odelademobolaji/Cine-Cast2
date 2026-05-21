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
}

function isDirectStream(url: string): boolean {
  return /\.(m3u8|mp4|webm|mkv|mov)(\?|$)/i.test(url);
}

export default function EmbedPlayer({ title, sources }: EmbedPlayerProps) {
  const playableSources = useMemo(
    () => sources.filter((s) => s.url.trim().length > 0),
    [sources],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "failed">("loading");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeSource = playableSources[activeIndex] ?? playableSources[0];

  // Parent-window popup blocker: freeze window.open + intercept popunder
  // blur-then-refocus trick in the host page.
  useEffect(() => {
    const orig = window.open.bind(window);
    try {
      Object.defineProperty(window, "open", {
        value: () => null,
        writable: false,
        configurable: true,
      });
    } catch {
      window.open = () => null as unknown as Window;
    }
    const onBlur = () => window.setTimeout(() => { try { window.focus(); } catch { /* ignore */ } }, 50);
    window.addEventListener("blur", onBlur);
    return () => {
      try { Object.defineProperty(window, "open", { value: orig, writable: true, configurable: true }); }
      catch { window.open = orig; }
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Reset load state on URL change and start a 15s failure timeout.
  useEffect(() => {
    if (!activeSource || isDirectStream(activeSource.url)) return;
    setLoadState("loading");
    const t = window.setTimeout(
      () => setLoadState((s) => (s === "loading" ? "failed" : s)),
      15000,
    );
    return () => window.clearTimeout(t);
  }, [activeSource?.url]);

  if (!activeSource) {
    return <div className="embed-empty">No embed source is configured for this title.</div>;
  }

  return (
    <div className="embed-shell">
      <div className="embed-controls" aria-label="Embed source controls">
        <div className="embed-source-tabs" role="tablist" aria-label="Video sources">
          {sources.map((source) => {
            const pi = playableSources.findIndex((s) => s.name === source.name);
            const playable = pi >= 0;
            return (
              <button
                key={source.name}
                type="button"
                className={`embed-source-tab${pi === activeIndex ? " is-active" : ""}${playable ? "" : " is-disabled"}`}
                onClick={() => { if (playable) setActiveIndex(pi); }}
                role="tab"
                aria-selected={pi === activeIndex}
                aria-disabled={!playable}
                disabled={!playable}
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
            title={`${title} — ${activeSource.name}`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="origin"
            allowFullScreen
            // Our /api/sport/embed proxy serves a sanitised page from our own
            // origin, where popups are blocked by an injected interceptor —
            // strict sandbox (no allow-same-origin) is safe and effective.
            // External embeds (vidlink.pro, vidsrc.to, embedme.top direct…)
            // need allow-same-origin because their player JS authenticates
            // against their own CDN via cookies/localStorage on their origin.
            sandbox={
              activeSource.url.startsWith("/")
                ? "allow-scripts allow-pointer-lock allow-presentation allow-orientation-lock"
                : "allow-scripts allow-same-origin allow-pointer-lock allow-presentation allow-orientation-lock"
            }
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
                Stream blocked or unavailable
              </div>
              <div style={{ color: "#aaa", fontSize: 13, maxWidth: 400 }}>
                Try a different source tab, or open the stream directly in a new tab.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={() => setActiveIndex((activeIndex + 1) % playableSources.length)}
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
                <a
                  href={activeSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#1a1a1a",
                    border: "1px solid #333",
                    color: "#ccc",
                    padding: "8px 18px",
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: "none",
                  }}
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

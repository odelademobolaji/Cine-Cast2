"use client";

import { useEffect, useMemo, useState } from "react";
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
  return url.includes(".m3u8") || url.includes(".mp4") || url.includes(".webm");
}

export default function EmbedPlayer({ title, sources }: EmbedPlayerProps) {
  const playableSources = useMemo(
    () => sources.filter((source) => source.url.trim().length > 0),
    [sources]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSource = playableSources[activeIndex] || playableSources[0];

  // Block ad popups from embed providers.
  // window.open override + blur re-focus (sandbox omitted — it kills nested video CDN sub-frames).
  useEffect(() => {
    const originalOpen = window.open.bind(window);
    window.open = () => null;
    const handleBlur = () => { window.setTimeout(() => window.focus(), 50); };
    window.addEventListener("blur", handleBlur);
    return () => {
      window.open = originalOpen;
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  if (!activeSource) {
    return <div className="embed-empty">No embed source is configured for this title.</div>;
  }

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
        // HLS / MP4 direct streams use VideoPlayer (hls.js) instead of an iframe
        <div className="embed-player" style={{ background: "#000" }}>
          <VideoPlayer key={activeSource.url} src={activeSource.url} title={title} />
        </div>
      ) : (
        <iframe
          key={activeSource.url}
          className="embed-player"
          src={activeSource.url}
          title={`${title} - ${activeSource.name}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
          allowFullScreen
          // allow-popups intentionally omitted — blocks all popup ads.
          // allow-top-navigation omitted — prevents redirect-hijack of the parent page.
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock allow-presentation"
        />
      )}
    </div>
  );
}

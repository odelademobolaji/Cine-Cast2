"use client";

import { useEffect, useMemo, useState } from "react";
import EmbedPlayer, { EmbedSource } from "@/components/EmbedPlayer";

const STREAM_SOURCES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
// Hardcoded relative URL — always served by the Next.js API route at
// app/api/sport/matches/route.ts. We intentionally ignore NEXT_PUBLIC_API_URL
// here so the Sport tab does not depend on the Python backend being running.
const SPORT_MATCHES_URL = "/api/sport/matches";

interface MatchSource {
  source: string;
  id?: string;
}

interface MatchTeam {
  name?: string;
  badge?: string;
  crest?: string;
  logo?: string;
}

interface Match {
  id: string;
  title?: string;
  name?: string;
  category?: string;
  sport?: string;
  date?: number;
  poster?: string;
  sources?: MatchSource[];
  streams?: MatchSource[];
  teams?: {
    home?: MatchTeam;
    away?: MatchTeam;
  };
}

function matchTitle(m: Match): string {
  if (m.title) return m.title;
  if (m.name) return m.name;
  const h = m.teams?.home?.name;
  const a = m.teams?.away?.name;
  if (h && a) return `${h} vs ${a}`;
  return m.id.replace(/-\d{6,}$/, "").replace(/-/g, " ");
}

function matchCategory(m: Match): string {
  return m.category || m.sport || "Sport";
}

function matchSources(m: Match): string[] {
  const src = m.sources || m.streams;
  if (src && src.length > 0) return src.map((s) => s.source).filter(Boolean);
  return STREAM_SOURCES;
}

export default function SportPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [hdIndex, setHdIndex] = useState(1);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SPORT_MATCHES_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      const arr: Match[] = Array.isArray(data)
        ? data
        : data.matches || data.events || data.data || [];
      setMatches(arr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const embedSources = useMemo((): EmbedSource[] => {
    if (!selected) return [];
    return matchSources(selected).map((src) => ({
      name: src.charAt(0).toUpperCase() + src.slice(1),
      url: `https://embedme.top/embed/${src}/${selected.id}/${hdIndex}`,
    }));
  }, [selected, hdIndex]);

  return (
    <div className="browse-page">
      {/* ── Header ── */}
      <header
        className="browse-header"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
      >
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Sport
            <span style={{ fontSize: 12, background: "#e50914", color: "#fff", borderRadius: 4, padding: "2px 8px", fontWeight: 700, letterSpacing: 1 }}>
              LIVE
            </span>
          </h1>
          <p>{selected ? matchTitle(selected) : "Select a match below to start watching."}</p>
        </div>
        <button
          onClick={fetchMatches}
          style={{ background: "#1a1a1a", border: "1px solid #333", color: "#aaa", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginTop: 4 }}
        >
          ↻ Refresh
        </button>
      </header>

      {/* ── Player section ── */}
      {selected && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#888", background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 4, padding: "3px 8px", textTransform: "capitalize" }}>
              {matchCategory(selected)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{matchTitle(selected)}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3].map((i) => (
                <button
                  key={i}
                  onClick={() => setHdIndex(i)}
                  style={{
                    background: hdIndex === i ? "#e50914" : "#1a1a1a",
                    border: `1px solid ${hdIndex === i ? "#e50914" : "#333"}`,
                    color: "#fff",
                    padding: "5px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: hdIndex === i ? 600 : 400,
                  }}
                >
                  HD {i}
                </button>
              ))}
            </div>
          </div>
          <EmbedPlayer
            key={`${selected.id}-${hdIndex}`}
            title={matchTitle(selected)}
            sources={embedSources}
          />
        </div>
      )}

      {/* ── Loading skeletons ── */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: "unset", height: 84, borderRadius: 8 }} />
          ))}
        </div>
      )}

      {/* ── Error state ── */}
      {!loading && error && (
        <div style={{ background: "#1a1a1a", border: "1px solid #e50914", borderRadius: 8, padding: "14px 18px", color: "#aaa", marginBottom: 20 }}>
          <strong style={{ color: "#fff", display: "block", marginBottom: 4 }}>Could not load live matches</strong>
          {error} —{" "}
          <button onClick={fetchMatches} style={{ background: "none", border: "none", color: "#e50914", cursor: "pointer", padding: 0, fontSize: "inherit" }}>
            Try again
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && matches.length === 0 && (
        <div style={{ color: "#aaa", padding: "40px 0", textAlign: "center", fontSize: 15 }}>
          No live matches at the moment — check back soon.
        </div>
      )}

      {/* ── Match grid ── */}
      {!loading && matches.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Live Now</h2>
            <span style={{ fontSize: 13, color: "#888" }}>{matches.length} matches</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {matches.map((m) => {
              const active = selected?.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(m);
                    setHdIndex(1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  style={{
                    background: active ? "#1e0a0c" : "#141414",
                    border: `1px solid ${active ? "#e50914" : "#222"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "#fff",
                    transition: "border-color 0.15s, background 0.15s",
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
                    <span style={{ fontSize: 10, background: "#e50914", color: "#fff", borderRadius: 3, padding: "2px 6px", fontWeight: 700, letterSpacing: 0.5 }}>
                      LIVE
                    </span>
                    <span style={{ fontSize: 10, color: "#888", background: "#222", borderRadius: 3, padding: "2px 6px", textTransform: "capitalize" }}>
                      {matchCategory(m)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, wordBreak: "break-word" }}>
                    {matchTitle(m)}
                  </div>
                  {m.teams?.home && m.teams?.away && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#666" }}>
                      <span style={{ color: "#999" }}>{m.teams.home.name}</span>
                      <span>vs</span>
                      <span style={{ color: "#999" }}>{m.teams.away.name}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

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
  live?: boolean;
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

// "admin" is a private streamed.su internal source not served by embedme.top.
const BLOCKED_SOURCES = new Set(["admin"]);

function matchSources(m: Match): string[] {
  const src = m.sources || m.streams;
  if (src && src.length > 0) {
    const filtered = src.map((s) => s.source).filter((s) => s && !BLOCKED_SOURCES.has(s));
    if (filtered.length > 0) return filtered;
  }
  return STREAM_SOURCES;
}

function matchSport(m: Match): string {
  return (m.category || m.sport || "other").toLowerCase();
}

function isMatchLive(m: Match): boolean {
  if (typeof m.live === "boolean") return m.live;
  if (m.date == null) return true;
  const ms = m.date > 1e12 ? m.date : m.date * 1000;
  return ms <= Date.now();
}

function formatMatchTime(date: number): string {
  const ms = date > 1e12 ? date : date * 1000;
  const d = new Date(ms);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const matchDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (matchDayStart === todayStart) return `Today ${timeStr}`;
  if (matchDayStart === todayStart + 86400000) return `Tomorrow ${timeStr}`;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ` ${timeStr}`;
}

function titleCase(s: string): string {
  return s.split(/[\s-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// streamed.su match objects don't always carry an explicit league field, so we
// also fall back to a regex sweep over the title/id for well-known leagues.
const LEAGUE_PATTERNS: [RegExp, string][] = [
  [/\bnba\b/i,                 "NBA"],
  [/\bnfl\b/i,                 "NFL"],
  [/\bnhl\b/i,                 "NHL"],
  [/\bmlb\b/i,                 "MLB"],
  [/\bmls\b/i,                 "MLS"],
  [/\bncaa\b/i,                "NCAA"],
  [/\bwnba\b/i,                "WNBA"],
  [/\beuroleague\b/i,          "EuroLeague"],
  [/\bpremier[\s-]?league\b/i, "Premier League"],
  [/\bchampionship\b/i,        "Championship"],
  [/\bla[\s-]?liga\b/i,        "La Liga"],
  [/\bbundesliga\b/i,          "Bundesliga"],
  [/\bserie[\s-]?a\b/i,        "Serie A"],
  [/\bligue[\s-]?1\b/i,        "Ligue 1"],
  [/\beredivisie\b/i,          "Eredivisie"],
  [/\bchampions[\s-]?league\b/i, "Champions League"],
  [/\beuropa[\s-]?league\b/i,  "Europa League"],
  [/\bconference[\s-]?league\b/i, "Conference League"],
  [/\bworld[\s-]?cup\b/i,      "World Cup"],
  [/\beuros?\b/i,              "Euros"],
  [/\bcopa[\s-]?america\b/i,   "Copa América"],
  [/\bsuper[\s-]?bowl\b/i,     "Super Bowl"],
  [/\bufc\b/i,                 "UFC"],
  [/\bf1\b|formula[\s-]?1/i,   "Formula 1"],
  [/\bmoto[\s-]?gp\b/i,        "MotoGP"],
  [/\batp\b/i,                 "ATP"],
  [/\bwta\b/i,                 "WTA"],
];

function matchLeague(m: Match): string | null {
  const any_m = m as unknown as Record<string, unknown>;
  for (const field of ["league", "competition", "tournament", "event"] as const) {
    const v = any_m[field];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const haystack = `${m.title || ""} ${m.name || ""} ${m.id || ""}`;
  for (const [pattern, label] of LEAGUE_PATTERNS) {
    if (pattern.test(haystack)) return label;
  }
  return null;
}

export default function SportPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [hdIndex, setHdIndex] = useState(1);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);

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
    // Each source from streamed.su has its own stream `id` which is what
    // embedme.top needs. Using the match's top-level `id` gives a 404.
    const rawSources = (selected.sources || selected.streams || []).filter(
      (s) => s.source && !BLOCKED_SOURCES.has(s.source)
    );
    if (rawSources.length > 0) {
      return rawSources.map((s) => ({
        name: s.source.charAt(0).toUpperCase() + s.source.slice(1),
        url: `https://embedme.top/embed/${s.source}/${s.id || selected.id}/${hdIndex}`,
      }));
    }
    // Fallback when no source list is returned by the API.
    return STREAM_SOURCES.map((src) => ({
      name: src.charAt(0).toUpperCase() + src.slice(1),
      url: `https://embedme.top/embed/${src}/${selected.id}/${hdIndex}`,
    }));
  }, [selected, hdIndex]);

  // Sport pills (sorted by descending match count).
  const sportCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      const s = matchSport(m);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])
    );
  }, [matches]);

  // League pills are scoped to the currently selected sport (if any).
  const leagueCounts = useMemo(() => {
    const scope = selectedSport
      ? matches.filter((m) => matchSport(m) === selectedSport)
      : matches;
    const counts = new Map<string, number>();
    for (const m of scope) {
      const l = matchLeague(m);
      if (l) counts.set(l, (counts.get(l) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])
    );
  }, [matches, selectedSport]);

  const filteredMatches = useMemo(() => {
    let out = matches;
    if (selectedSport) out = out.filter((m) => matchSport(m) === selectedSport);
    if (selectedLeague) out = out.filter((m) => matchLeague(m) === selectedLeague);
    return out;
  }, [matches, selectedSport, selectedLeague]);

  const liveMatches = useMemo(() => filteredMatches.filter(isMatchLive), [filteredMatches]);

  const upcomingMatches = useMemo(() =>
    filteredMatches
      .filter((m) => !isMatchLive(m))
      .sort((a, b) => {
        if (a.date == null && b.date == null) return 0;
        if (a.date == null) return 1;
        if (b.date == null) return -1;
        const aMs = a.date > 1e12 ? a.date : a.date * 1000;
        const bMs = b.date > 1e12 ? b.date : b.date * 1000;
        return aMs - bMs;
      }),
    [filteredMatches]);

  // Reset filters whose option disappeared after a data refresh.
  useEffect(() => {
    if (selectedSport && !sportCounts.some(([s]) => s === selectedSport)) {
      setSelectedSport(null);
      setSelectedLeague(null);
    }
  }, [sportCounts, selectedSport]);
  useEffect(() => {
    if (selectedLeague && !leagueCounts.some(([l]) => l === selectedLeague)) {
      setSelectedLeague(null);
    }
  }, [leagueCounts, selectedLeague]);

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
            {isMatchLive(selected) && (
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
            )}
          </div>
          {isMatchLive(selected) ? (
            <EmbedPlayer
              key={`${selected.id}-${hdIndex}`}
              title={matchTitle(selected)}
              sources={embedSources}
            />
          ) : (
            <div style={{
              background: "#111",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 240,
              gap: 10,
              color: "#aaa",
            }}>
              <span style={{ fontSize: 28 }}>🕐</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: "#fff" }}>Match not started yet</span>
              {selected.date && (
                <span style={{ fontSize: 13 }}>
                  Starts {formatMatchTime(selected.date)}
                </span>
              )}
            </div>
          )}
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

      {/* ── Filters ── */}
      {!loading && matches.length > 0 && sportCounts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <FilterRow
            label="Sport"
            options={[["All", matches.length], ...sportCounts.map(([k, v]) => [titleCase(k), v] as [string, number])]}
            selected={selectedSport ? titleCase(selectedSport) : "All"}
            onSelect={(name) => {
              setSelectedSport(name === "All" ? null : name.toLowerCase());
              setSelectedLeague(null);
            }}
          />
          {leagueCounts.length > 0 && (
            <FilterRow
              label="League"
              options={[
                ["All", selectedSport ? matches.filter((m) => matchSport(m) === selectedSport).length : matches.length],
                ...leagueCounts,
              ]}
              selected={selectedLeague || "All"}
              onSelect={(name) => setSelectedLeague(name === "All" ? null : name)}
            />
          )}
        </div>
      )}

      {/* ── Match grid ── */}
      {!loading && matches.length > 0 && (
        <>
          {filteredMatches.length === 0 ? (
            <div style={{ color: "#aaa", padding: "24px 0", textAlign: "center", fontSize: 14 }}>
              No matches for the selected filters.
            </div>
          ) : (
            <>
              {liveMatches.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>Live Now</h2>
                    <span style={{ fontSize: 13, color: "#888" }}>{liveMatches.length} matches</span>
                  </div>
                  <MatchGrid matches={liveMatches} selected={selected} onSelect={(m) => { setSelected(m); setHdIndex(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                </>
              )}
              {upcomingMatches.length > 0 && (
                <div style={{ marginTop: liveMatches.length > 0 ? 32 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>Upcoming</h2>
                    <span style={{ fontSize: 13, color: "#888" }}>{upcomingMatches.length} matches</span>
                  </div>
                  <MatchGrid matches={upcomingMatches} selected={selected} onSelect={(m) => { setSelected(m); setHdIndex(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function MatchGrid({
  matches,
  selected,
  onSelect,
}: {
  matches: Match[];
  selected: Match | null;
  onSelect: (m: Match) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {matches.map((m) => {
        const active = selected?.id === m.id;
        const live = isMatchLive(m);
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            style={{
              background: active ? (live ? "#1e0a0c" : "#0d1a0d") : "#141414",
              border: `1px solid ${active ? (live ? "#e50914" : "#4caf50") : "#222"}`,
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
              {live ? (
                <span style={{ fontSize: 10, background: "#e50914", color: "#fff", borderRadius: 3, padding: "2px 6px", fontWeight: 700, letterSpacing: 0.5 }}>
                  LIVE
                </span>
              ) : (
                <span style={{ fontSize: 10, background: "#1a2e1a", color: "#4caf50", borderRadius: 3, padding: "2px 6px", fontWeight: 600 }}>
                  {m.date ? formatMatchTime(m.date) : "UPCOMING"}
                </span>
              )}
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
  );
}

function FilterRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: [string, number][];
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#888", minWidth: 50, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(([name, count]) => {
          const active = selected === name;
          return (
            <button
              key={name}
              onClick={() => onSelect(name)}
              style={{
                background: active ? "#e50914" : "#1a1a1a",
                border: `1px solid ${active ? "#e50914" : "#2a2a2a"}`,
                color: "#fff",
                padding: "5px 11px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {name}
              <span style={{ opacity: 0.6, marginLeft: 6 }}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

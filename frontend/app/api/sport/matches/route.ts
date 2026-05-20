import { NextResponse } from "next/server";

// Tried in order; first one that returns a non-empty list wins.
const ENDPOINTS: [string, string][] = [
  ["https://streamed.su", "/api/matches/all/popular"],
  ["https://streamed.su", "/api/matches/popular"],
  ["https://streamed.su", "/api/matches/live"],
  ["https://streamed.su", "/api/matches/all"],
  ["https://streamed.pk", "/api/matches/all/popular"],
  ["https://streamed.pk", "/api/matches/popular"],
  ["https://streamed.pk", "/api/matches/live"],
  ["https://streamed.me", "/api/matches/all/popular"],
  ["https://streamed.me", "/api/matches/popular"],
];

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

function normalise(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["matches", "events", "data", "results", "items"]) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export async function GET() {
  for (const [base, path] of ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { ...BASE_HEADERS, Referer: `${base}/`, Origin: base },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const matches = normalise(data);
        if (matches.length > 0) {
          return NextResponse.json(matches, {
            headers: { "Cache-Control": "no-store" },
          });
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return NextResponse.json([]);
}

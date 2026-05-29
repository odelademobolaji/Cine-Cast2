import { NextRequest, NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Ad/tracker domains to silently drop rather than proxy.
const AD_PATTERNS = [
  "googlesyndication",
  "doubleclick",
  "adnxs",
  "popads",
  "popcash",
  "adsterra",
  "adskeeper",
  "propellerad",
  "hilltopads",
  "trafficjunky",
];

// For M3U8 manifests: rewrite every URI line (segment or sub-playlist) to go
// through this proxy so the player never directly contacts the CDN.
function rewriteM3u8(text: string, baseUrl: URL): string {
  const P = "/api/sport/proxy?url=";
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      if (t.startsWith("/api/sport/proxy")) return line; // already proxied
      if (/^https?:\/\//i.test(t)) return P + encodeURIComponent(t);
      try {
        return P + encodeURIComponent(new URL(t, baseUrl).href);
      } catch {
        return line;
      }
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Protocol not allowed" }, { status: 400 });
  }

  if (AD_PATTERNS.some((p) => parsed.hostname.includes(p))) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://embedme.top/",
        Origin: "https://embedme.top",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const isM3u8 =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u") ||
      targetUrl.includes(".m3u8");

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-cache",
    };

    if (isM3u8) {
      const text = await res.text();
      const rewritten = rewriteM3u8(text, parsed);
      return new NextResponse(rewritten, {
        status: res.status,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          ...corsHeaders,
        },
      });
    }

    // Stream everything else (JS, CSS, video segments, images) directly.
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      ...corsHeaders,
    };
    const cl = res.headers.get("content-length");
    if (cl) headers["Content-Length"] = cl;

    return new NextResponse(res.body, { status: res.status, headers });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

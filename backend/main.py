"""
CineCast backend with Cineby API integration.
Run: uvicorn main:app --reload --port 8000
"""
from __future__ import annotations
import json, base64
from datetime import date
from typing import Annotated, Optional, Any
from urllib.parse import quote, unquote
import re
import httpx
from fastapi import FastAPI, Header, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from config_loader import get_cors_origins, get_tmdb_base, get_tmdb_key, reload_config

# Cineby API Configuration
CINEBY_DB_BASE = "https://db.videasy.net/3"
CINEBY_API_BASE = "https://api.videasy.net"

CINEBY_PROVIDERS = {
    "neon": "mb-flix/sources-with-title",
    "cypher": "downloader2/sources-with-title",
    "yoru": "cdn/sources-with-title",
    "sage": "lmovies/sources-with-title",
    "breach": "m4uhd/sources-with-title",
    "vyse": "hdmovie/sources-with-title",
    "fade": "hdmovie/sources-with-title",
    "raze": "superflix/sources-with-title",
    "omen": "lamovie/sources-with-title",
    "killjoy": "meine/sources-with-title",
}

app = FastAPI(title="CineCast Backend", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=get_cors_origins(),
                   allow_methods=["GET", "POST"], allow_headers=["*"])
# The bundled/PyCharm Python on this Windows install does not have a usable
# CA path, so verified TLS requests fail before the source resolver can run.
_http = httpx.AsyncClient(timeout=30.0, follow_redirects=True, verify=False)
DEBUG_PROXY = False
HEX_PAYLOAD_RE = re.compile(r"^[0-9a-fA-F]+$")

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("http://localhost:3000")

@app.on_event("shutdown")
async def _close_http_client() -> None:
    await _http.aclose()

def verify_auth(authorization: str | None) -> str:
    if not authorization: return "anonymous"
    if authorization.startswith("Bearer "): return authorization[7:]
    raise HTTPException(status_code=401, detail="Invalid auth header")

# --- TMDB proxy ---
async def tmdb_get(path: str, params: dict | None = None) -> dict:
    params = dict(params or {}); params["api_key"] = get_tmdb_key()
    url = f"{get_tmdb_base()}{path}"
    try:
        r = await _http.get(url, params=params)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"TMDB request failed: {type(e).__name__}: {e}") from e
    if r.status_code != 200: raise HTTPException(status_code=r.status_code, detail=f"TMDB: {r.text}")
    return r.json()

@app.get("/api/tmdb/trending")
async def trending(window: str = "week"): return await tmdb_get(f"/trending/movie/{window}")
@app.get("/api/tmdb/movie/top-rated")
async def top_rated(page: int = 1): return await tmdb_get("/movie/top_rated", {"page": page})
@app.get("/api/tmdb/movie/popular")
async def popular_movies(page: int = 1): return await tmdb_get("/movie/popular", {"page": page})
@app.get("/api/tmdb/movie/latest")
async def latest_movies(page: int = 1):
    return await tmdb_get("/discover/movie", {
        "page": page,
        "sort_by": "primary_release_date.desc",
        "primary_release_date.lte": date.today().isoformat(),
        "include_adult": "false",
        "include_video": "false",
        "vote_count.gte": 5,
    })
@app.get("/api/tmdb/tv/popular")
async def popular_tv(page: int = 1): return await tmdb_get("/tv/popular", {"page": page})
@app.get("/api/tmdb/tv/latest")
async def latest_tv(page: int = 1):
    return await tmdb_get("/discover/tv", {
        "page": page,
        "sort_by": "first_air_date.desc",
        "first_air_date.lte": date.today().isoformat(),
        "include_adult": "false",
        "vote_count.gte": 5,
    })
@app.get("/api/tmdb/movie/{movie_id}")
async def movie_detail(movie_id: int): return await tmdb_get(f"/movie/{movie_id}")
@app.get("/api/tmdb/tv/{tv_id}")
async def tv_detail(tv_id: int): return await tmdb_get(f"/tv/{tv_id}")
@app.get("/api/tmdb/search")
async def search(query: str): return await tmdb_get("/search/multi", {"query": query})

# --- Cineby API Integration ---
class VideoSource(BaseModel):
    provider: str
    url: str
    quality: Optional[str] = None
    type: Optional[str] = None
    subtitles: list[dict] = []

class ProviderDiagnostic(BaseModel):
    provider: str
    status: Optional[int] = None
    content_type: Optional[str] = None
    bytes: int = 0
    outcome: str
    detail: Optional[str] = None

class SourceResponse(BaseModel):
    movie_id: int
    title: str
    sources: list[VideoSource]
    fallback_url: Optional[str] = None
    diagnostics: list[ProviderDiagnostic] = []

class EmbedProviderInfo(BaseModel):
    provider: str
    label: str
    required_params: list[str]
    embed_pattern: str
    supported_tlds: list[str] = []
    notes: str

class EmbedUrlResponse(BaseModel):
    provider: str
    embed_url: str
    warnings: list[str] = []

EMBED_PROVIDERS = {
    "doodstream": {
        "label": "Doodstream",
        "required_params": ["filecode"],
        "embed_pattern": "https://dood.{tld}/e/{filecode}",
        "supported_tlds": ["so", "la", "ws", "sh"],
        "notes": "Builds the public embed URL from a host filecode. Direct token URLs are intentionally not generated.",
    },
    "byse": {
        "label": "Byse",
        "required_params": ["filecode"],
        "embed_pattern": "https://byse.watch/embed/{filecode}",
        "supported_tlds": [],
        "notes": "Builds the public embed URL from a host filecode. Undocumented internal APIs are intentionally not used.",
    },
    "azmovies": {
        "label": "AZMovies",
        "required_params": ["slug"],
        "embed_pattern": "https://azmovies.to/movie/{slug}",
        "supported_tlds": [],
        "notes": "Builds the movie page URL from a slug. Add the slug to provider-mappings.json to enable this source.",
    },
}

SAFE_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]+$")
SAFE_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")

@app.get("/api/embed-providers", response_model=list[EmbedProviderInfo])
async def list_embed_providers():
    return [
        EmbedProviderInfo(provider=provider, **metadata)
        for provider, metadata in EMBED_PROVIDERS.items()
    ]

@app.get("/api/embed-providers/{provider}/embed", response_model=EmbedUrlResponse)
async def build_embed_url(provider: str,
                          filecode: Optional[str] = Query(None),
                          slug: Optional[str] = Query(None),
                          tld: str = Query("so")):
    provider_key = provider.lower()
    metadata = EMBED_PROVIDERS.get(provider_key)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Unsupported embed provider: {provider}")

    warnings = [metadata["notes"]]

    if provider_key == "doodstream":
        if not filecode or not SAFE_TOKEN_RE.match(filecode):
            raise HTTPException(status_code=400, detail="Doodstream requires a valid filecode.")
        if tld not in metadata["supported_tlds"]:
            raise HTTPException(status_code=400, detail=f"Unsupported Doodstream TLD: {tld}")
        embed_url = metadata["embed_pattern"].format(tld=tld, filecode=filecode)
    elif provider_key == "byse":
        if not filecode or not SAFE_TOKEN_RE.match(filecode):
            raise HTTPException(status_code=400, detail="Byse requires a valid filecode.")
        embed_url = metadata["embed_pattern"].format(filecode=filecode)
    elif provider_key == "azmovies":
        if not slug or not SAFE_SLUG_RE.match(slug):
            raise HTTPException(status_code=400, detail="AZMovies requires a valid movie slug.")
        embed_url = metadata["embed_pattern"].format(slug=quote(slug))
    else:
        raise HTTPException(status_code=404, detail=f"Unsupported embed provider: {provider}")

    return EmbedUrlResponse(provider=provider_key, embed_url=embed_url, warnings=warnings)

def extract_sources_from_response(data: Any, provider: str) -> list[dict]:
    """
    Extract video sources from various Cineby API response formats.
    Handles: direct arrays, nested objects, encoded strings, etc.
    """
    sources = []

    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                item["provider"] = provider
                sources.append(item)
            elif isinstance(item, str):
                # Might be a direct URL
                sources.append({"provider": provider, "url": item, "type": "hls" if ".m3u8" in item else "mp4"})

    elif isinstance(data, dict):
        # Try common nested keys
        for key in ["sources", "data", "streams", "videos", "result", "results", "playlist"]:
            if key in data:
                nested = data[key]
                if isinstance(nested, list):
                    for item in nested:
                        if isinstance(item, dict):
                            item["provider"] = provider
                            sources.append(item)
                        elif isinstance(item, str):
                            sources.append({"provider": provider, "url": item, "type": "hls" if ".m3u8" in item else "mp4"})
                elif isinstance(nested, dict):
                    nested["provider"] = provider
                    sources.append(nested)
                break

        # If no nested sources found, check if the dict itself is a source
        if not sources and "url" in data:
            data["provider"] = provider
            sources.append(data)

        # Check for encoded/encrypted data
        if not sources:
            for key in ["encrypted", "encoded", "cipher", "payload"]:
                if key in data and isinstance(data[key], str):
                    # Try base64 decode
                    try:
                        decoded = base64.b64decode(data[key]).decode('utf-8')
                        parsed = json.loads(decoded)
                        return extract_sources_from_response(parsed, provider)
                    except:
                        pass

    # Also check if data itself is a string (might be JSON string)
    elif isinstance(data, str):
        try:
            parsed = json.loads(data)
            return extract_sources_from_response(parsed, provider)
        except:
            # Might be a direct URL
            if data.startswith("http"):
                sources.append({"provider": provider, "url": data, "type": "hls" if ".m3u8" in data else "mp4"})

    return sources

async def fetch_cineby_sources(provider: str, title: str, media_type: str, year: int,
                                tmdb_id: int, imdb_id: Optional[str] = None,
                                season_id: int = 1, episode_id: int = 1,
                                diagnostics: Optional[list[dict]] = None) -> list[dict]:
    endpoint_path = CINEBY_PROVIDERS.get(provider)
    if not endpoint_path: return []

    params = {
        "title": title,  # Let httpx handle encoding
        "mediaType": media_type,
        "year": year,
        "tmdbId": tmdb_id,
        "seasonId": season_id,
        "episodeId": episode_id,
    }
    if imdb_id: params["imdbId"] = imdb_id
    if provider == "killjoy": params["language"] = "german"

    url = f"{CINEBY_API_BASE}/{endpoint_path}"

    try:
        # Add headers to mimic browser
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://cineby.app/",
            "Origin": "https://cineby.app",
        }

        r = await _http.get(url, params=params, headers=headers, timeout=20.0)

        print(f"[Cineby] {provider}: status={r.status_code}, len={len(r.text)}")
        content_type = r.headers.get("content-type", "")

        if r.status_code != 200:
            print(f"[Cineby] {provider}: failed with {r.status_code}")
            if diagnostics is not None:
                diagnostics.append({
                    "provider": provider,
                    "status": r.status_code,
                    "content_type": content_type,
                    "bytes": len(r.text),
                    "outcome": "provider_error",
                    "detail": r.text[:240],
                })
            return []

        # Try to parse response

        if "application/json" in content_type or r.text.strip().startswith(("{", "[")):
            try:
                data = r.json()
                sources = extract_sources_from_response(data, provider)
                print(f"[Cineby] {provider}: extracted {len(sources)} sources")
                if diagnostics is not None:
                    diagnostics.append({
                        "provider": provider,
                        "status": r.status_code,
                        "content_type": content_type,
                        "bytes": len(r.text),
                        "outcome": "json_sources" if sources else "json_no_sources",
                        "detail": f"{len(sources)} source(s) extracted",
                    })
                return sources
            except Exception as e:
                print(f"[Cineby] {provider}: JSON parse error: {e}")
                if diagnostics is not None:
                    diagnostics.append({
                        "provider": provider,
                        "status": r.status_code,
                        "content_type": content_type,
                        "bytes": len(r.text),
                        "outcome": "json_parse_error",
                        "detail": str(e),
                    })
                return []

        # Check if response is HTML (might be a redirect or error page)
        if "<html" in r.text.lower() or "<!doctype" in r.text.lower():
            print(f"[Cineby] {provider}: got HTML response, might need different approach")
            if diagnostics is not None:
                diagnostics.append({
                    "provider": provider,
                    "status": r.status_code,
                    "content_type": content_type,
                    "bytes": len(r.text),
                    "outcome": "html_response",
                    "detail": "Provider returned HTML instead of sources",
                })
            return []

        # Might be a direct m3u8 or mp4 URL
        if r.text.strip().startswith("http"):
            url_text = r.text.strip()
            if diagnostics is not None:
                diagnostics.append({
                    "provider": provider,
                    "status": r.status_code,
                    "content_type": content_type,
                    "bytes": len(r.text),
                    "outcome": "direct_url",
                    "detail": "Provider returned a direct URL",
                })
            return [{"provider": provider, "url": url_text, "type": "hls" if ".m3u8" in url_text else "mp4"}]

        # Might be an m3u8 playlist directly
        if "#extm3u" in r.text.lower():
            if diagnostics is not None:
                diagnostics.append({
                    "provider": provider,
                    "status": r.status_code,
                    "content_type": content_type,
                    "bytes": len(r.text),
                    "outcome": "playlist_body",
                    "detail": "Provider returned an HLS playlist body",
                })
            return [{"provider": provider, "url": str(r.url), "type": "hls"}]

        if HEX_PAYLOAD_RE.match(r.text.strip()) and len(r.text.strip()) > 100:
            print(f"[Cineby] {provider}: encrypted/encoded text payload not supported")
            if diagnostics is not None:
                diagnostics.append({
                    "provider": provider,
                    "status": r.status_code,
                    "content_type": content_type,
                    "bytes": len(r.text),
                    "outcome": "encrypted_payload",
                    "detail": "Provider returned an encrypted text payload, not JSON/direct URLs",
                })
            return []

        if diagnostics is not None:
            diagnostics.append({
                "provider": provider,
                "status": r.status_code,
                "content_type": content_type,
                "bytes": len(r.text),
                "outcome": "unsupported_response",
                "detail": r.text[:240],
            })

        return []

    except Exception as e:
        print(f"[Cineby] {provider}: exception: {e}")
        if diagnostics is not None:
            diagnostics.append({
                "provider": provider,
                "outcome": "request_exception",
                "detail": f"{type(e).__name__}: {e}",
            })
        return []

async def fetch_cineby_metadata(tmdb_id: int, locale: str = "en-US") -> dict:
    url = f"{CINEBY_DB_BASE}/movie/{tmdb_id}"
    params = {
        "append_to_response": "credits,external_ids,videos,recommendations,translations,similar,release_dates",
        "language": locale,
        "include_video_language": "en,null",
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://cineby.app/",
    }
    try:
        r = await _http.get(url, params=params, headers=headers, timeout=15.0)
        if r.status_code != 200: return {}
        return r.json()
    except Exception as e:
        print(f"[Cineby] metadata error: {e}")
        return {}

async def resolve_best_source(sources: list[dict], preferred_type: str = "hls") -> Optional[VideoSource]:
    if not sources: return None

    for source in sources:
        url = source.get("url", source.get("file", source.get("src", source.get("link", ""))))
        source_type = source.get("type", "")
        if not url: continue

        if preferred_type == "hls" and (".m3u8" in url or source_type == "hls" or source_type == "application/x-mpegURL"):
            return VideoSource(
                provider=source.get("provider", "unknown"),
                url=url,
                quality=source.get("quality") or source.get("label") or source.get("res"),
                type="hls",
                subtitles=source.get("subtitles", source.get("tracks", [])),
            )

    for source in sources:
        url = source.get("url", source.get("file", source.get("src", source.get("link", ""))))
        if not url: continue

        st = "mp4"
        if ".m3u8" in url or "hls" in url.lower(): st = "hls"
        elif ".mpd" in url: st = "dash"
        elif ".mp4" in url: st = "mp4"
        elif ".webm" in url: st = "webm"

        return VideoSource(
            provider=source.get("provider", "unknown"),
            url=url,
            quality=source.get("quality") or source.get("label") or source.get("res"),
            type=st,
            subtitles=source.get("subtitles", source.get("tracks", [])),
        )

    return None

PROVIDER_PRIORITY = ["neon", "cypher", "yoru", "sage", "breach", "vyse", "fade", "raze", "omen", "killjoy"]

@app.get("/api/sources/{movie_id}", response_model=SourceResponse)
async def get_movie_sources(movie_id: int, request: Request,
                            authorization: Annotated[str | None, Header()] = None):
    user_id = verify_auth(authorization)

    # Get metadata
    metadata = await fetch_cineby_metadata(movie_id)
    if not metadata:
        try: metadata = await tmdb_get(f"/movie/{movie_id}")
        except HTTPException: raise HTTPException(status_code=404, detail=f"Movie {movie_id} not found")

    title = metadata.get("title", metadata.get("name", "Unknown"))
    year_str = metadata.get("release_date", metadata.get("first_air_date", ""))[:4]
    if not year_str: year_str = str(metadata.get("year", 2024))
    year = int(year_str) if year_str.isdigit() else 2024

    imdb_id = None
    external_ids = metadata.get("external_ids", {})
    if external_ids: imdb_id = external_ids.get("imdb_id")

    print(f"[Cineby] Fetching sources for: {title} ({year}) TMDB:{movie_id} IMDb:{imdb_id}")

    all_sources = []
    best_source = None
    provider_diagnostics = []

    for provider in PROVIDER_PRIORITY:
        ps = await fetch_cineby_sources(provider, title, "movie", year, movie_id, imdb_id, diagnostics=provider_diagnostics)
        if ps:
            all_sources.extend(ps)
            if not best_source: best_source = await resolve_best_source(ps)

    video_sources = []
    for src in all_sources:
        if not isinstance(src, dict): continue
        url = src.get("url", src.get("file", src.get("src", src.get("link", ""))))
        if not url: continue

        st = "mp4"
        if ".m3u8" in url or "hls" in url.lower(): st = "hls"
        elif ".mpd" in url: st = "dash"

        video_sources.append(VideoSource(
            provider=src.get("provider", "unknown"),
            url=url,
            quality=src.get("quality") or src.get("label") or src.get("res"),
            type=st,
            subtitles=src.get("subtitles", src.get("tracks", [])),
        ))

    fallback_url = None
    if not video_sources:
        print("[Cineby] No provider sources found")
    else:
        print(f"[Cineby] Found {len(video_sources)} sources, best: {best_source.url if best_source else 'none'}")

    return SourceResponse(movie_id=movie_id, title=title, sources=video_sources, fallback_url=fallback_url, diagnostics=provider_diagnostics)

@app.get("/api/sources/tv/{tv_id}")
async def get_tv_sources(tv_id: int, season: int = Query(1, ge=1), episode: int = Query(1, ge=1),
                         request: Request = None, authorization: Annotated[str | None, Header()] = None):
    user_id = verify_auth(authorization)
    metadata = await fetch_cineby_metadata(tv_id)
    if not metadata:
        try: metadata = await tmdb_get(f"/tv/{tv_id}")
        except HTTPException: raise HTTPException(status_code=404, detail=f"TV show {tv_id} not found")

    title = metadata.get("name", metadata.get("title", "Unknown"))
    year_str = metadata.get("first_air_date", metadata.get("release_date", ""))[:4]
    if not year_str: year_str = str(metadata.get("year", 2024))
    year = int(year_str) if year_str.isdigit() else 2024

    imdb_id = None
    external_ids = metadata.get("external_ids", {})
    if external_ids: imdb_id = external_ids.get("imdb_id")

    all_sources = []
    provider_diagnostics = []
    for provider in PROVIDER_PRIORITY:
        ps = await fetch_cineby_sources(provider, title, "tv", year, tv_id, imdb_id, season, episode, diagnostics=provider_diagnostics)
        if ps: all_sources.extend(ps)

    video_sources = []
    for src in all_sources:
        if not isinstance(src, dict): continue
        url = src.get("url", src.get("file", src.get("src", src.get("link", ""))))
        if not url: continue
        st = "mp4"
        if ".m3u8" in url: st = "hls"
        elif ".mpd" in url: st = "dash"
        video_sources.append(VideoSource(
            provider=src.get("provider", "unknown"),
            url=url, quality=src.get("quality"), type=st,
            subtitles=src.get("subtitles", []),
        ))

    return SourceResponse(movie_id=tv_id, title=title, sources=video_sources, diagnostics=provider_diagnostics)

# --- Legacy configured video proxy ---
@app.get("/api/video/{movie_id}")
async def proxy_video(movie_id: int, request: Request):
    raise HTTPException(status_code=404, detail="Configured test-video fallbacks have been removed. Use /api/sources/{movie_id}.")

# --- Cineby video proxy ---
@app.get("/api/proxy-video")
async def proxy_external_video(request: Request, url: str = Query(..., description="External video URL to proxy")):
    decoded_url = unquote(url)
    fwd_headers = {}
    range_header = request.headers.get("range")
    if range_header: fwd_headers["Range"] = range_header

    # Important: mimic a real browser to avoid being blocked
    fwd_headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    fwd_headers["Accept"] = "*/*"
    fwd_headers["Accept-Language"] = "en-US,en;q=0.9"
    fwd_headers["Accept-Encoding"] = "identity"
    fwd_headers["Origin"] = "https://cineby.app"
    fwd_headers["Referer"] = "https://cineby.app/"

    try:
        if DEBUG_PROXY:
            print(f"[Proxy] Fetching: {decoded_url[:80]}...")
        upstream_req = _http.build_request("GET", decoded_url, headers=fwd_headers)
        upstream = await _http.send(upstream_req, stream=True)

        passthrough = ("content-type", "content-length", "content-range")
        resp_headers = {h: upstream.headers[h] for h in passthrough if h in upstream.headers}
        resp_headers["accept-ranges"] = upstream.headers.get("accept-ranges", "bytes")

        # Add CORS headers
        resp_headers["access-control-allow-origin"] = "*"
        resp_headers["access-control-allow-headers"] = "*"

        async def body():
            try:
                async for chunk in upstream.aiter_bytes(): yield chunk
            finally: await upstream.aclose()

        if DEBUG_PROXY or upstream.status_code >= 400:
            print(f"[Proxy] Status: {upstream.status_code}, Content-Type: {upstream.headers.get('content-type', 'unknown')}")
        return StreamingResponse(body(), status_code=upstream.status_code, headers=resp_headers)
    except Exception as e:
        print(f"[Proxy] Error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to proxy video: {str(e)}")

# --- Page proxy (strips X-Frame-Options so sites load inside iframes) ---
@app.get("/api/proxy-page")
async def proxy_page(url: str = Query(..., description="Page URL to load inside an iframe")):
    decoded_url = unquote(url)
    # Derive origin for <base href> so relative links resolve correctly
    parts = decoded_url.split("/")
    origin = "/".join(parts[:3])  # e.g. https://azmovies.to

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
    }
    try:
        r = await _http.get(decoded_url, headers=headers, timeout=20.0)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=f"Upstream returned {r.status_code}")

        content = r.text
        # Neutralize frame-busting JS that redirects top.location
        frame_bust_fix = (
            '<script>'
            'try{Object.defineProperty(window,"top",{get:function(){return window;}});}catch(e){}'
            '</script>'
        )
        base_tag = f'<base href="{origin}/">'
        inject = base_tag + frame_bust_fix
        if "</head>" in content:
            content = content.replace("</head>", inject + "</head>", 1)
        elif "<head>" in content:
            content = content.replace("<head>", "<head>" + inject, 1)
        else:
            content = inject + content

        return HTMLResponse(
            content=content,
            headers={"access-control-allow-origin": "*", "cache-control": "no-cache"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Page proxy error: {type(e).__name__}: {e}")

# --- Sport live matches proxy ---
_SPORT_ENDPOINTS = [
    ("https://streamed.su",  "/api/matches/all/popular"),
    ("https://streamed.su",  "/api/matches/popular"),
    ("https://streamed.su",  "/api/matches/live"),
    ("https://streamed.su",  "/api/matches/all"),
    ("https://streamed.pk",  "/api/matches/all/popular"),
    ("https://streamed.pk",  "/api/matches/popular"),
    ("https://streamed.pk",  "/api/matches/live"),
    ("https://streamed.me",  "/api/matches/all/popular"),
    ("https://streamed.me",  "/api/matches/popular"),
]

def _normalise_matches(data: Any) -> list:
    """Return a flat list of match objects regardless of response shape."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("matches", "events", "data", "results", "items"):
            if isinstance(data.get(key), list):
                return data[key]
    return []

@app.get("/api/sport/matches")
async def sport_matches():
    """Proxy live sport matches, trying multiple streamed.* endpoints."""
    _base_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
    }
    seen_bases: set[str] = set()
    for base_url, path in _SPORT_ENDPOINTS:
        # Only log the first failure per domain to avoid log noise
        first_attempt = base_url not in seen_bases
        seen_bases.add(base_url)
        try:
            headers = {**_base_headers, "Referer": f"{base_url}/", "Origin": base_url}
            r = await _http.get(f"{base_url}{path}", headers=headers, timeout=12.0)
            if r.status_code == 200:
                data = r.json()
                matches = _normalise_matches(data)
                if matches:
                    print(f"[Sport] Got {len(matches)} matches from {base_url}{path}")
                    return matches
                # 200 but empty — keep trying
                print(f"[Sport] {base_url}{path} returned empty list")
            elif first_attempt:
                print(f"[Sport] {base_url} returned {r.status_code}")
        except Exception as e:
            if first_attempt:
                print(f"[Sport] {base_url} error: {type(e).__name__}: {e}")
    return []

# --- Admin / health ---
@app.post("/api/admin/reload-config")
async def reload(): reload_config(); return {"status": "reloaded"}
@app.get("/health")
async def health(): return {"status": "ok"}

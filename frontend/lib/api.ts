const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8030";

export interface Movie {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
}

export interface VideoSource {
  provider: string;
  url: string;
  quality?: string;
  type?: string;
  subtitles: Array<{ url: string; lang: string; label?: string }>;
}

export interface SourceResponse {
  movie_id: number;
  title: string;
  sources: VideoSource[];
  fallback_url?: string;
}

export interface EmbedProviderInfo {
  provider: string;
  label: string;
  required_params: string[];
  embed_pattern: string;
  supported_tlds: string[];
  notes: string;
}

export interface EmbedUrlResponse {
  provider: string;
  embed_url: string;
  warnings: string[];
}

async function fetchJson<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

export function backdropUrl(path: string | null, size: string = "original"): string {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function posterUrl(path: string | null, size: string = "w500"): string {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function getTrending() { return fetchJson("/api/tmdb/trending"); }
export async function getTopRated() { return fetchJson("/api/tmdb/movie/top-rated"); }
export async function getPopularMovies() { return fetchJson("/api/tmdb/movie/popular"); }
export async function getLatestMovies() { return fetchJson("/api/tmdb/movie/latest"); }
export async function getPopularTv() { return fetchJson("/api/tmdb/tv/popular"); }
export async function getLatestTv() { return fetchJson("/api/tmdb/tv/latest"); }
export async function getMovieDetail(movieId: number) { return fetchJson(`/api/tmdb/movie/${movieId}`); }
export async function getTvDetail(tvId: number) { return fetchJson(`/api/tmdb/tv/${tvId}`); }

// Cineby API integration
export async function getMovieSources(movieId: number): Promise<SourceResponse> {
  return fetchJson(`/api/sources/${movieId}`);
}

export async function getTvSources(tvId: number, season: number = 1, episode: number = 1): Promise<SourceResponse> {
  return fetchJson(`/api/sources/tv/${tvId}?season=${season}&episode=${episode}`);
}

export async function getEmbedProviders(): Promise<EmbedProviderInfo[]> {
  return fetchJson("/api/embed-providers");
}

export async function buildProviderEmbedUrl(
  provider: string,
  params: { filecode?: string; slug?: string; tld?: string }
): Promise<EmbedUrlResponse> {
  const query = new URLSearchParams();
  if (params.filecode) query.set("filecode", params.filecode);
  if (params.slug) query.set("slug", params.slug);
  if (params.tld) query.set("tld", params.tld);
  return fetchJson(`/api/embed-providers/${provider}/embed?${query.toString()}`);
}

export function getProxiedVideoUrl(externalUrl: string): string {
  const encoded = encodeURIComponent(externalUrl);
  return `${API_BASE}/api/proxy-video?url=${encoded}`;
}

export function pickBestSource(sources: VideoSource[]): VideoSource | null {
  if (!sources || sources.length === 0) return null;
  const typePriority: Record<string, number> = { hls: 1, mp4: 2, dash: 3 };
  const sorted = [...sources].sort((a, b) => {
    const ap = typePriority[a.type || ""] || 99;
    const bp = typePriority[b.type || ""] || 99;
    return ap - bp;
  });
  return sorted[0];
}

export async function getBestVideoUrl(movieId: number): Promise<{ url: string; title: string; source: VideoSource } | null> {
  try {
    const response = await getMovieSources(movieId);
    const best = pickBestSource(response.sources);
    if (!best) return null;
    return { url: getProxiedVideoUrl(best.url), title: response.title, source: best };
  } catch (error) {
    console.error("Failed to get video sources:", error);
    return null;
  }
}

export const api = {
  trending: getTrending,
  latestMovies: getLatestMovies,
  latestTV: getLatestTv,
  popularMovies: getPopularMovies,
  popularTV: getPopularTv,
  topRated: getTopRated,
  movieDetail: getMovieDetail,
  tvDetail: getTvDetail,
  movie: getMovieDetail,
  movieSources: getMovieSources,
  tvSources: getTvSources,
  embedProviders: getEmbedProviders,
  buildProviderEmbedUrl,
  pickBestSource,
  getBestVideoUrl,
  getProxiedVideoUrl,
  backdropUrl,
  posterUrl,
};

export default api;

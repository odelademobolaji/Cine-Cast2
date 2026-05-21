import { notFound } from "next/navigation";
import { getMovieDetail } from "@/lib/api";
import EmbedPlayer, { EmbedSource } from "@/components/EmbedPlayer";
import providerMappings from "@/data/provider-mappings.json";

interface PlayerPageProps {
  params: { id: string };
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const movieId = parseInt(params.id, 10);
  if (isNaN(movieId)) notFound();

  const movieData = await getMovieDetail(movieId).catch(() => null);
  const title = movieData?.title || movieData?.name || `Movie #${movieId}`;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8030";
  const providerMapping = getMovieProviderMapping(movieId);
  const azmoviesPageUrl = providerMapping.azmoviesEmbedUrl ||
    (providerMapping.azmoviesSlug ? `https://azmovies.to/movie/${providerMapping.azmoviesSlug}` : "");
  const azmoviesUrl = azmoviesPageUrl
    ? `${apiBase}/api/proxy-page?url=${encodeURIComponent(azmoviesPageUrl)}`
    : "";
  const doodstreamTld = providerMapping.doodstreamTld || "so";
  const doodstreamUrl = providerMapping.doodstreamEmbedUrl
    || (providerMapping.doodstreamFilecode ? `https://dood.${doodstreamTld}/e/${providerMapping.doodstreamFilecode}` : "");
  const byseUrl = providerMapping.byseFilecode
    ? `https://byse.watch/embed/${providerMapping.byseFilecode}`
    : "";
  const embedSources: EmbedSource[] = [
    { name: "VidLink", url: `https://vidlink.pro/movie/${movieId}` },
    { name: "VidSrc", url: `https://vidsrc.to/embed/movie/${movieId}` },
    { name: "2Embed", url: `https://www.2embed.cc/embed/${movieId}` },
    { name: "Sport", url: "https://lb10.strmd.top/secure/.../stream/.../mono.m3u8" },
    ...(azmoviesUrl ? [{ name: "AZMovies", url: azmoviesUrl }] : []),
    ...(doodstreamUrl ? [{ name: "Doodstream", url: doodstreamUrl }] : []),
    ...(byseUrl ? [{ name: "Byse", url: byseUrl }] : []),
  ];

  return (
    <div className="player-wrap">
      <a href={`/movie/${movieId}`} className="player-back">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        Back
      </a>

      <EmbedPlayer title={title} sources={embedSources} />

      <div style={{ marginTop: 16, color: "#aaa", fontSize: 14 }}>
        <h2 style={{ color: "#fff", marginBottom: 8 }}>{title}</h2>
        <p>{movieData?.overview}</p>
        <div style={{ marginTop: 12, fontSize: 12, color: "#888", fontFamily: "monospace", wordBreak: "break-all" }}>
          Primary embed: {embedSources[0].url}
        </div>
      </div>
    </div>
  );
}

interface MovieProviderMapping {
  azmoviesSlug?: string;
  azmoviesEmbedUrl?: string;
  doodstreamEmbedUrl?: string;
  doodstreamFilecode?: string;
  doodstreamTld?: string;
  byseFilecode?: string;
}

function getMovieProviderMapping(movieId: number): MovieProviderMapping {
  const mappings = providerMappings as { movies?: Record<string, MovieProviderMapping> };
  return mappings.movies?.[String(movieId)] || {};
}

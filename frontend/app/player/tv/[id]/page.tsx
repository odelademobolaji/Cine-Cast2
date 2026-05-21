import { notFound } from "next/navigation";
import { getTvDetail } from "@/lib/api";
import EmbedPlayer, { EmbedSource } from "@/components/EmbedPlayer";
import providerMappings from "@/data/provider-mappings.json";

interface TvPlayerPageProps {
  params: { id: string };
  searchParams: { season?: string; episode?: string };
}

export default async function TvPlayerPage({ params, searchParams }: TvPlayerPageProps) {
  const tvId = parseInt(params.id, 10);
  const season = parseInt(searchParams.season || "1", 10);
  const episode = parseInt(searchParams.episode || "1", 10);
  if (isNaN(tvId)) notFound();

  const tvData = await getTvDetail(tvId).catch(() => null);
  const title = `${tvData?.name || tvData?.title || `TV #${tvId}`} - S${season}E${episode}`;
  const providerMapping = getTvEpisodeProviderMapping(tvId, season, episode);
  const doodstreamTld = providerMapping.doodstreamTld || "so";
  const doodstreamUrl = providerMapping.doodstreamEmbedUrl
    || (providerMapping.doodstreamFilecode ? `https://dood.${doodstreamTld}/e/${providerMapping.doodstreamFilecode}` : "");
  const byseUrl = providerMapping.byseFilecode
    ? `https://byse.watch/embed/${providerMapping.byseFilecode}`
    : "";
  const embedSources: EmbedSource[] = [
    { name: "VidLink", url: `https://vidlink.pro/tv/${tvId}/${season}/${episode}` },
    { name: "VidSrc", url: `https://vidsrc.to/embed/tv/${tvId}/${season}/${episode}` },
    { name: "2Embed", url: `https://www.2embed.cc/embedtv/${tvId}&s=${season}&e=${episode}` },
    { name: "Sport", url: "https://lb10.strmd.top/secure/.../stream/.../mono.m3u8" },
    ...(doodstreamUrl ? [{ name: "Doodstream", url: doodstreamUrl }] : []),
    ...(byseUrl ? [{ name: "Byse", url: byseUrl }] : []),
  ];

  return (
    <div className="player-wrap">
      <a href={`/tv/${tvId}`} className="player-back">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        Back
      </a>

      <EmbedPlayer title={title} sources={embedSources} />

      <div style={{ marginTop: 16, color: "#aaa", fontSize: 14 }}>
        <h2 style={{ color: "#fff", marginBottom: 8 }}>{tvData?.name || tvData?.title}</h2>
        <p>Season {season}, Episode {episode}</p>
        <p>{tvData?.overview}</p>
        <div style={{ marginTop: 12, fontSize: 12, color: "#888", fontFamily: "monospace", wordBreak: "break-all" }}>
          Primary embed: {embedSources[0].url}
        </div>
      </div>
    </div>
  );
}

interface TvEpisodeProviderMapping {
  doodstreamEmbedUrl?: string;
  doodstreamFilecode?: string;
  doodstreamTld?: string;
  byseFilecode?: string;
}

function getTvEpisodeProviderMapping(tvId: number, season: number, episode: number): TvEpisodeProviderMapping {
  const mappings = providerMappings as { tvEpisodes?: Record<string, TvEpisodeProviderMapping> };
  return mappings.tvEpisodes?.[`${tvId}:${season}:${episode}`] || {};
}

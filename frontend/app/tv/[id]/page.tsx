import { notFound } from "next/navigation";
import Link from "next/link";
import { getTvDetail, posterUrl } from "@/lib/api";

interface TvDetailPageProps {
  params: { id: string };
}

export default async function TvDetailPage({ params }: TvDetailPageProps) {
  const tvId = parseInt(params.id, 10);
  if (isNaN(tvId)) notFound();

  const show = await getTvDetail(tvId);
  if (!show || show.success === false) notFound();

  const year = (show.first_air_date || "").slice(0, 4);
  const rating = show.vote_average?.toFixed(1) ?? "-";

  return (
    <div>
      <Link href="/tv" className="back">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Back
      </Link>
      <div className="detail-grid">
        <div className="detail-poster" style={{ backgroundImage: `url(${posterUrl(show.poster_path)})` }} />
        <div>
          <h1 className="detail-title">{show.name || show.title}</h1>
          <div className="detail-tags">
            <span className="tag">{year}</span>
            <span className="tag rating">★ {rating}</span>
            {show.genres?.map((genre: any) => (
              <span key={genre.id} className="tag">{genre.name}</span>
            ))}
          </div>
          <p className="detail-overview">{show.overview}</p>
          <div className="actions">
            <Link href={`/player/tv/${tvId}?season=1&episode=1`} className="btn primary">▶ Watch S1 E1</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

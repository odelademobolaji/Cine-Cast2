import { notFound } from "next/navigation";
import Link from "next/link";
import { getMovieDetail, posterUrl } from "@/lib/api";

interface MovieDetailPageProps {
  params: { id: string };
}

export default async function MovieDetailPage({ params }: MovieDetailPageProps) {
  const movieId = parseInt(params.id, 10);
  if (isNaN(movieId)) notFound();
  const movie = await getMovieDetail(movieId);
  if (!movie || movie.success === false) notFound();
  const year = (movie.release_date || "").slice(0, 4);
  const rating = movie.vote_average?.toFixed(1) ?? "—";

  return (
    <div>
      <Link href="/" className="back">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Back
      </Link>
      <div className="detail-grid">
        <div className="detail-poster" style={{ backgroundImage: `url(${posterUrl(movie.poster_path)})` }} />
        <div>
          <h1 className="detail-title">{movie.title}</h1>
          <div className="detail-tags">
            <span className="tag">{year}</span>
            <span className="tag rating">★ {rating}</span>
            {movie.genres?.map((g: any) => <span key={g.id} className="tag">{g.name}</span>)}
          </div>
          <p className="detail-overview">{movie.overview}</p>
          <div className="actions">
            <Link href={`/player/movie/${movieId}`} className="btn primary">▶ Watch Now</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

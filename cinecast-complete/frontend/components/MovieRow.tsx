/**
 * Movie row — async Server Component.
 */
import Link from 'next/link';
import { api, posterUrl, Movie } from '@/lib/api';

type Source = 'trending' | 'topRated' | 'popularMovies' | 'popularTV';

export async function MovieRow({ title, source, mediaType = 'movie' }: {
  title: string;
  source: Source;
  mediaType?: 'movie' | 'tv';
}) {
  const data = await api[source]();
  const items: Movie[] = data.results.slice(0, 12);
  return (
    <section className="row">
      <h3 className="row-title">{title}</h3>
      <div className="row-grid">
        {items.map((m) => <Card key={m.id} movie={m} mediaType={mediaType} />)}
      </div>
    </section>
  );
}

function Card({ movie, mediaType }: { movie: Movie; mediaType: 'movie' | 'tv' }) {
  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const rating = movie.vote_average?.toFixed(1) ?? '—';
  return (
    <Link href={`/${mediaType}/${movie.id}`} className="card">
      <div className="poster" style={{ backgroundImage: `url(${posterUrl(movie.poster_path)})` }} />
      <div className="card-title">{movie.title || movie.name}</div>
      <div className="card-meta"><span>{year}</span><span>★ {rating}</span></div>
    </Link>
  );
}

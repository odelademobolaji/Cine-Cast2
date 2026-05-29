/**
 * Hero section — async Server Component.
 */
import Link from 'next/link';
import { api, backdropUrl } from '@/lib/api';

export async function HeroSection() {
  const data = await api.trending();
  const featured = data.results[0];
  if (!featured) return null;
  const year = (featured.release_date || featured.first_air_date || '').slice(0, 4);
  const rating = featured.vote_average?.toFixed(1) ?? '—';
  const mediaType = featured.media_type || 'movie';

  return (
    <div className="hero">
      <div className="hero-bg" style={{ backgroundImage: `url(${backdropUrl(featured.backdrop_path)})` }} />
      <div className="hero-content">
        <h1 className="hero-title">{featured.title || featured.name}</h1>
        <div className="hero-meta">{year} · ★ {rating} · Featured</div>
        <p className="hero-overview">{featured.overview?.slice(0, 240)}…</p>
        <Link href={`/player/${mediaType}/${featured.id}`} className="hero-cta">▶ Play now</Link>
      </div>
    </div>
  );
}

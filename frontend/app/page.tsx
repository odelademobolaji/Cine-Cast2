/**
 * Home page — Server Component with Streaming SSR + Suspense.
 */
import { Suspense } from 'react';
import { HeroSection } from '@/components/HeroSection';
import { MovieRow } from '@/components/MovieRow';
import { MovieRowSkeleton } from '@/components/MovieRowSkeleton';

export default function HomePage() {
  return (
    <>
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />
      </Suspense>
      <Suspense fallback={<MovieRowSkeleton title="Trending" />}>
        <MovieRow title="Trending" source="trending" />
      </Suspense>
      <Suspense fallback={<MovieRowSkeleton title="Top Rated" />}>
        <MovieRow title="Top Rated" source="topRated" />
      </Suspense>
      <Suspense fallback={<MovieRowSkeleton title="Popular Movies" />}>
        <MovieRow title="Popular Movies" source="popularMovies" />
      </Suspense>
      <Suspense fallback={<MovieRowSkeleton title="Popular TV" />}>
        <MovieRow title="Popular TV" source="popularTV" mediaType="tv" />
      </Suspense>
    </>
  );
}

function HeroSkeleton() {
  return <div className="hero" style={{ background: '#1a1a1a' }} />;
}

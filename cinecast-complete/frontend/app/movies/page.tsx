import { MediaGrid } from "@/components/MediaGrid";
import { getLatestMovies } from "@/lib/api";

export default async function MoviesPage() {
  const data = await getLatestMovies();

  return (
    <div className="browse-page">
      <header className="browse-header">
        <h1>Movies</h1>
        <p>Latest movies first, sorted by release date.</p>
      </header>
      <MediaGrid items={data.results || []} mediaType="movie" />
    </div>
  );
}

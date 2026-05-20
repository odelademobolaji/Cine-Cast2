import { MediaGrid } from "@/components/MediaGrid";
import { getLatestTv } from "@/lib/api";

export default async function TvPage() {
  const data = await getLatestTv();

  return (
    <div className="browse-page">
      <header className="browse-header">
        <h1>TV</h1>
        <p>Latest series first, sorted by first air date.</p>
      </header>
      <MediaGrid items={data.results || []} mediaType="tv" />
    </div>
  );
}

import Link from "next/link";
import { Movie, posterUrl } from "@/lib/api";

interface MediaGridProps {
  items: Movie[];
  mediaType: "movie" | "tv";
}

export function MediaGrid({ items, mediaType }: MediaGridProps) {
  return (
    <div className="browse-grid">
      {items.map((item) => {
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const rating = item.vote_average?.toFixed(1) ?? "-";
        const title = item.title || item.name || "Untitled";

        return (
          <Link key={item.id} href={`/${mediaType}/${item.id}`} className="card" tabIndex={0}>
            <div className="poster" style={{ backgroundImage: `url(${posterUrl(item.poster_path)})` }} />
            <div className="card-title">{title}</div>
            <div className="card-meta">
              <span>{year}</span>
              <span>★ {rating}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

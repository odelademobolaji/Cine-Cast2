import Link from 'next/link';
import './globals.css';
import TVBackHandler from '@/components/TVBackHandler';
import TVScrollManager from '@/components/TVScrollManager';

export const metadata = {
  title: 'CineCast',
  description: 'Stream movies, TV shows, and live sport',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Handles webOS hardware back button and registers media keys */}
        <TVBackHandler />
        {/* Scrolls focused element into view when d-pad moves focus */}
        <TVScrollManager />
        <nav className="nav">
          <div className="logo">Cine<span className="dot">Cast</span></div>
          <div className="nav-links">
            <Link href="/" tabIndex={0}>Home</Link>
            <Link href="/movies" tabIndex={0}>Movies</Link>
            <Link href="/tv" tabIndex={0}>TV</Link>
            <Link href="/sport" tabIndex={0}>Sport</Link>
          </div>
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}

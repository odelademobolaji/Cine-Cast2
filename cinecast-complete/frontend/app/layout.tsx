/**
 * Root layout — server-rendered shell.
 */
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'HoddTv',
  description: 'Next.js streaming architecture demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="logo">Hodd<span className="dot">.</span>tv</div>
          <div className="nav-links">
            <Link href="/">Home</Link>
            <Link href="/movies">Movies</Link>
            <Link href="/tv">TV</Link>
            <Link href="/sport">Sport</Link>
          </div>
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}

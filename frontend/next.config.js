/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow all origins to load images (TV browser doesn't send referrer headers)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // webOS browsers require explicit CORP header for some media
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8030";
    return {
      afterFiles: [
        { source: "/api/:path*", destination: `${backend}/api/:path*` },
        { source: "/health",     destination: `${backend}/health` },
      ],
    };
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
  },
};
module.exports = nextConfig;

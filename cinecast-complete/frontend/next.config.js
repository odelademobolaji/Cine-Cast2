/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8030";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/health",     destination: `${backend}/health` },
    ];
  },
};
module.exports = nextConfig;

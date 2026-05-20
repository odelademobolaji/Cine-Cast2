/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8030";
    return {
      // beforeFiles: checked before filesystem — unused here.
      // afterFiles: checked after Next.js file-system routes (API routes,
      //   pages). This means our app/api/sport/matches/route.ts takes
      //   priority over the wildcard rewrite below for that path.
      afterFiles: [
        { source: "/api/:path*", destination: `${backend}/api/:path*` },
        { source: "/health",     destination: `${backend}/health` },
      ],
    };
  },
};
module.exports = nextConfig;

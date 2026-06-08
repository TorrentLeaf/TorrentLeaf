/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // NOTE: `/` now serves the public marketing landing (src/app/page.tsx). The
  // old framework-level redirect of `/` → `/library` was removed so the landing
  // is reachable without auth.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig

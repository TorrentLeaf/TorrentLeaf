/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Redirect the app root to /library at the framework level. Doing it here
  // (instead of a Server Component calling redirect()) avoids a Next 16 +
  // Turbopack dev quirk where the render-timing instrumentation throws
  // "HomePage cannot have a negative time stamp".
  async redirects() {
    return [{ source: '/', destination: '/library', permanent: false }]
  },
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

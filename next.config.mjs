/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Add common security and caching headers for improved DevTools signals
  async headers() {
    return [
      // Security headers for all routes
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; connect-src 'self' https: wss: https://sensible-terrier-111.convex.cloud wss://sensible-terrier-111.convex.cloud; img-src 'self' data:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data:",
          },
        ],
      },

      // Ensure API responses explicitly include a utf-8 charset (helps DevTools warnings)
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Type", value: "application/json; charset=utf-8" },
        ],
      },

      // Long-lived caching for next static assets
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/public/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

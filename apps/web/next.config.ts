import type { NextConfig } from "next";

import { apiServerBaseUrl } from "./src/shared/config/api.server";

const apiBaseUrl = apiServerBaseUrl();
const distDir = process.env.NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // Django/DRF owns slash-sensitive API routes. Preserve those paths through
  // the same-origin proxy instead of normalizing them before the rewrite.
  skipTrailingSlashRedirect: true,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBaseUrl}/api/v1/:path*/`,
      },
    ];
  },
};

export default nextConfig;

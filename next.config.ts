import type { NextConfig } from "next";

// Content-Security-Policy is set per-request (with a nonce) in
// src/middleware.ts. The headers below don't need per-request randomness,
// so they're set once here.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp"],
  experimental: {
    serverActions: {
      // Next's own default (1MB) is well under what our upload forms
      // advertise - up to 10 photos at 15MB each, or a 20MB document -
      // so real uploads were silently hitting this platform-level cap
      // before our own size validation (and its friendly error) ever ran.
      bodySizeLimit: "150mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;

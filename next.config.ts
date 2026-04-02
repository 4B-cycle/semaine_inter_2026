import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  output:
    process.env.NODE_ENV === "development"
      ? undefined
      : isVercel
        ? undefined
        : "export",

  // Headers CORS uniquement sur Vercel (inutiles pour l'export statique)
  ...(isVercel && {
    async headers() {
      return [
        {
          source: "/api/:path*",
          headers: [
            { key: "Access-Control-Allow-Origin", value: "*" },
            {
              key: "Access-Control-Allow-Methods",
              value: "GET, POST, OPTIONS",
            },
            { key: "Access-Control-Allow-Headers", value: "Content-Type" },
          ],
        },
      ];
    },
  }),

  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(process.env.CAPACITOR_BUILD === "true" ? { output: "export" } : {}),

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

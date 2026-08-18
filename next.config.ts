import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/server-only packages out of the webpack bundle — pg's
  // optional pg-native require otherwise breaks non-node compilations.
  serverExternalPackages: ["pg", "@prisma/client", "@prisma/adapter-pg"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.amazonaws.com", // S3 assets
      },
    ],
  },
};

export default nextConfig;

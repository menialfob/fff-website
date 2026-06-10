import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Docker image only needs the traced server bundle.
  output: "standalone",
  experimental: {
    serverActions: {
      // Uploads (images, small videos, documents) go through server actions.
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;

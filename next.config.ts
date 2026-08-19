import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Docker image only needs the traced server bundle.
  output: "standalone",
  experimental: {
    serverActions: {
      // Uploads (images, small videos, documents) go through server actions.
      bodySizeLimit: "200mb",
    },
    // The middleware protects every route, so every upload body is cloned
    // through it — and Next only clones the first 10 MB by default, ending
    // the stream there. It does not fail the request: the route reads a
    // truncated body and stores it as if whole, which is how a 14 MB photo
    // became a 10 MB file that renders with a grey band where the missing
    // rows should be. Must stay >= MAX_FILE_SIZE.
    middlewareClientMaxBodySize: "200mb",
  },
};

export default nextConfig;

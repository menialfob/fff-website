import type { MetadataRoute } from "next";

// Web app manifest so Android/Chrome "Add to Home Screen" installs the site
// with the FFF icon and dark theme. iOS uses the apple-touch-icon
// (app/apple-icon.tsx) instead. Served at /manifest.webmanifest — kept public
// in the middleware matcher so it loads before login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FFF",
    short_name: "FFF",
    description: "Hjemsted for Fælles Formiddags Fædre",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a12",
    theme_color: "#0c0a12",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

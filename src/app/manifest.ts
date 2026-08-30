import type { MetadataRoute } from "next";

/**
 * `handle_links` is a shipped Chromium manifest member that Next's
 * `MetadataRoute.Manifest` type does not carry yet.
 */
type Manifest = MetadataRoute.Manifest & {
  handle_links?: "auto" | "preferred" | "not-preferred";
};

// Web app manifest so Android/Chrome "Add to Home Screen" installs the site
// with the FFF icon and dark theme. iOS uses the apple-touch-icon
// (app/apple-icon.tsx) instead. Served at /manifest.webmanifest — kept public
// in the middleware matcher so it loads before login.
//
// `scope` + `handle_links` are what make a tapped link open the installed app
// instead of the browser on Android: Chrome installs the PWA as a WebAPK whose
// Android manifest declares an intent filter over exactly this scope, so the OS
// hands in-scope https links — a calendar event's `URL:` line, a link pasted
// into a group chat — to the app. Two limits worth knowing: it only applies to
// Chrome installs (a Samsung Internet or Firefox "add to home screen" is a
// plain shortcut), and Android 12+ dropped the chooser dialog, so when the OS
// has not verified the domain the link silently opens in the browser instead —
// the member turns it back on under Settings › Apps › FFF › Open by default ›
// "Open supported links". We cannot help that from here: the WebAPK is signed
// by Chrome's minting server, so there is no key to publish in an
// /.well-known/assetlinks.json.
//
// iOS has no equivalent at all. A home screen web app can never claim a URL, so
// links tapped in Calendar, Mail or Messages always land in Safari — which,
// because an installed PWA gets storage separate from Safari, means the login
// page. Push notifications (public/sw.js) remain the only way to put an iOS
// member on a specific page inside the installed app.
export default function manifest(): Manifest {
  return {
    id: "/",
    name: "FFF",
    short_name: "FFF",
    description: "Hjemsted for Fælles Formiddags Fædre",
    start_url: "/",
    scope: "/",
    handle_links: "preferred",
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

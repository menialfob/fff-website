"use client";

import { useEffect } from "react";

/**
 * Registers the Web Push service worker (public/sw.js) once, on the client.
 * Rendered in the authenticated layout so every logged-in page has the worker
 * available for notifications. No-op where service workers are unsupported.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[sw] registration failed:", err);
    });
  }, []);

  return null;
}

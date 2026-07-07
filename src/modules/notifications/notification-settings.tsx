"use client";

import { useEffect, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, errorText, okText } from "@/components/ui";
import {
  sendTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
} from "./actions";

/** VAPID keys are base64url; the subscribe() API needs a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this legacy flag on installed web apps.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// What the UI should show, derived from browser capabilities + permission.
type State =
  | "loading"
  | "unsupported" // no service worker / push support at all
  | "ios-install" // iOS, push possible but the PWA must be installed first
  | "prompt" // supported + installed (or desktop) but not yet subscribed
  | "enabled" // subscribed on this device
  | "blocked"; // permission denied in browser settings

export function NotificationSettings({
  vapidPublicKey,
}: {
  // Passed from the server (read from env at runtime) rather than a
  // NEXT_PUBLIC_ build-time inline, so the key can live in the production
  // runtime .env without rebuilding the image. Empty when unconfigured.
  vapidPublicKey: string;
}) {
  const { t } = useI18n();
  const n = t.profile.notifications;
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  // Determine the current state on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        Boolean(vapidPublicKey);
      if (!supported) {
        // On iOS the APIs only exist inside the installed PWA; if we're on iOS
        // in a plain Safari tab, guide the user to install rather than saying
        // "unsupported".
        if (isIos() && !isStandalone()) {
          if (!cancelled) setState("ios-install");
        } else if (!cancelled) {
          setState("unsupported");
        }
        return;
      }
      if (isIos() && !isStandalone()) {
        if (!cancelled) setState("ios-install");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "enabled" : "prompt");
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "prompt");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      const result = await subscribeToPush({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setState("enabled");
    } catch {
      setError(n.enableFailed);
    }
  }

  async function disable() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("prompt");
    } catch {
      setError(n.enableFailed);
    }
  }

  function test() {
    setSent(false);
    startTransition(async () => {
      await sendTestNotification();
      setSent(true);
    });
  }

  if (state === "loading") return null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">{n.hint}</p>

      {state === "unsupported" && (
        <p className="text-sm text-zinc-500">{n.unsupported}</p>
      )}

      {state === "ios-install" && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="mb-1 text-sm font-medium text-zinc-200">{n.iosTitle}</p>
          <p className="whitespace-pre-line text-sm text-zinc-400">
            {n.iosSteps}
          </p>
        </div>
      )}

      {state === "blocked" && <p className={errorText}>{n.blocked}</p>}

      {state === "prompt" && (
        <button type="button" onClick={enable} className={btnPrimary}>
          {n.enable}
        </button>
      )}

      {state === "enabled" && (
        <div className="space-y-3">
          <p className={okText}>{n.enabledOn}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={test}
              disabled={pending}
              className={btnSecondary}
            >
              {pending ? n.sending : n.test}
            </button>
            <button type="button" onClick={disable} className={btnSecondary}>
              {n.disable}
            </button>
          </div>
          {sent && <p className={okText}>{n.sent}</p>}
        </div>
      )}

      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}

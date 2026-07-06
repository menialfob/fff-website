import { auth } from "@/lib/auth";
import {
  addPresence,
  onlineUserIds,
  removePresence,
  subscribe,
  type RealtimeEvent,
} from "@/lib/realtime";

// Long-lived SSE stream — never cache or statically optimize it.
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for chat. One connection per open client carries
 * every channel's events (a small friend group, so no per-channel streams);
 * the client filters by the channel it's viewing. Opening the stream also
 * marks the user present; closing it releases presence.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const encoder = new TextEncoder();

  let cleanedUp = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (unsubscribe) unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
    removePresence(userId);
  }

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: RealtimeEvent) =>
        write(`data: ${JSON.stringify(event)}\n\n`);

      addPresence(userId);
      // Send this client an immediate presence snapshot so it can render the
      // online list without waiting for the next transition.
      send({ type: "presence", online: onlineUserIds() });

      unsubscribe = subscribe(send);
      // Comment pings keep the connection alive through Caddy/proxies and let
      // us notice a dead peer.
      heartbeat = setInterval(() => write(`: ping\n\n`), 25_000);
    },
    cancel() {
      cleanup();
    },
  });

  // Belt-and-braces: also clean up if the request is aborted.
  request.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

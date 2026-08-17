import { auth } from "@/lib/auth";
import { accessibleConversationIds } from "@/modules/chat/data";
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
 * every channel the user may access (a small friend group, so no per-channel
 * streams); the client filters by the channel it's viewing. Events for
 * channels the user cannot access are filtered out server-side — role-gated
 * content must never reach an unauthorized client, even one that only
 * ignores it. Opening the stream also marks the user present; closing it
 * releases presence.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const encoder = new TextEncoder();

  // Authorization snapshot for this connection. A role or membership change
  // mid-connection applies on reconnect (EventSource reconnects often).
  const accessible = await accessibleConversationIds(
    { role: session.user.role, extraRoles: session.user.extraRoles },
    userId,
  );
  const allowed = new Set(accessible);
  const mayForward = (event: RealtimeEvent) =>
    event.type === "presence" || allowed.has(event.conversationId);

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

      unsubscribe = subscribe((event) => {
        // Membership changes keep this connection's allow-set current:
        // added members start receiving events immediately, removed members
        // stop — and both get the conversation event itself so the UI can
        // update the list.
        if (event.type === "conversation") {
          const couldSee = allowed.has(event.conversationId);
          const nowMember = event.memberIds.includes(userId);
          if (nowMember) allowed.add(event.conversationId);
          else allowed.delete(event.conversationId);
          if (nowMember || couldSee) send(event);
          return;
        }
        if (mayForward(event)) send(event);
      });
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

import { EventEmitter } from "events";

/*
 * In-process realtime transport for chat (Option 3a: "own it").
 *
 * A single Node process serves the whole site, so a process-local EventEmitter
 * is enough to fan messages out to every connected SSE client — no Redis. The
 * same registry that tracks open SSE connections doubles as the presence
 * source ("who is active in the app right now").
 *
 * Everything the chat feature needs from realtime goes through this module, so
 * swapping to a managed primitive (Ably/Pusher/Supabase Realtime) later means
 * reimplementing just this file, not the feature.
 *
 * Caveats by design: state is in-memory, so it resets when the container is
 * recreated on deploy. Clients reconnect (EventSource does this automatically)
 * and rehydrate messages from SQLite; presence self-heals as clients reconnect.
 */

export type ReactionSummary = {
  emoji: string;
  count: number;
  userIds: string[];
};

export type PollTally = { optionId: string; count: number; userIds: string[] };

export type PollDTO = {
  id: string;
  question: string;
  multiple: boolean;
  closesAt: string | null;
  options: { id: string; text: string }[];
  tallies: PollTally[];
};

export type EventCardDTO = {
  eventId: string;
  date: string;
  title: string;
  goingCount: number;
};

export type MessageDTO = {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string } | null;
  reactions: ReactionSummary[];
  poll: PollDTO | null;
  event: EventCardDTO | null;
};

export type RealtimeEvent =
  | { type: "message"; channelId: string; message: MessageDTO }
  | {
      type: "reaction";
      channelId: string;
      messageId: string;
      reactions: ReactionSummary[];
    }
  | { type: "poll"; channelId: string; pollId: string; tallies: PollTally[] }
  | { type: "typing"; channelId: string; user: { id: string; name: string } }
  | { type: "presence"; online: string[] };

type Bus = {
  emitter: EventEmitter;
  // userId -> number of open SSE connections for that user.
  presence: Map<string, number>;
  // userId -> timer that flips them offline after the grace window.
  pendingOffline: Map<string, ReturnType<typeof setTimeout>>;
};

// Survive HMR in dev (mirrors the Prisma singleton in src/lib/db.ts).
const globalForRealtime = globalThis as unknown as { __fffRealtime?: Bus };
const bus: Bus =
  globalForRealtime.__fffRealtime ??
  {
    emitter: new EventEmitter(),
    presence: new Map(),
    pendingOffline: new Map(),
  };
// Many concurrent SSE clients each add a listener; lift the default cap.
bus.emitter.setMaxListeners(0);
if (!globalForRealtime.__fffRealtime) globalForRealtime.__fffRealtime = bus;

// Keep a user shown "online" briefly after their last connection drops, so a
// page navigation or a flaky mobile network doesn't cause presence flicker.
const OFFLINE_GRACE_MS = 12_000;

const EVENT = "event";

export function emitEvent(event: RealtimeEvent): void {
  bus.emitter.emit(EVENT, event);
}

/** Subscribe to every realtime event; returns an unsubscribe function. */
export function subscribe(handler: (event: RealtimeEvent) => void): () => void {
  bus.emitter.on(EVENT, handler);
  return () => {
    bus.emitter.off(EVENT, handler);
  };
}

export function onlineUserIds(): string[] {
  return [...bus.presence.keys()];
}

export function isOnline(userId: string): boolean {
  return bus.presence.has(userId);
}

function broadcastPresence(): void {
  emitEvent({ type: "presence", online: onlineUserIds() });
}

/** Register an opened SSE connection for a user. */
export function addPresence(userId: string): void {
  const pending = bus.pendingOffline.get(userId);
  if (pending) {
    clearTimeout(pending);
    bus.pendingOffline.delete(userId);
  }
  const wasPresent = bus.presence.has(userId);
  bus.presence.set(userId, (bus.presence.get(userId) ?? 0) + 1);
  if (!wasPresent) broadcastPresence();
}

/** Deregister a closed SSE connection; flips offline after a grace window. */
export function removePresence(userId: string): void {
  const count = bus.presence.get(userId) ?? 0;
  if (count > 1) {
    bus.presence.set(userId, count - 1);
    return;
  }
  // Last connection closed — keep them "online" for the grace period, then
  // drop them if no new connection arrived meanwhile.
  bus.presence.set(userId, 0);
  const timer = setTimeout(() => {
    bus.pendingOffline.delete(userId);
    if ((bus.presence.get(userId) ?? 0) === 0) {
      bus.presence.delete(userId);
      broadcastPresence();
    }
  }, OFFLINE_GRACE_MS);
  bus.pendingOffline.set(userId, timer);
}

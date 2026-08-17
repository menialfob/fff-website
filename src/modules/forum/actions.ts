"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { fmt, type Dictionary } from "@/lib/i18n";
import { notifyMembers } from "@/lib/notify";
import {
  claimAssets,
  collectAssetIds,
  parseContentFields,
  type ParsedContent,
} from "@/modules/content/assets";
import { EVENTS_CATEGORY_SLUG } from "./events";

const MAX_TITLE = 140;
const MAX_CATEGORY_NAME = 80;
const MAX_CATEGORY_DESC = 300;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Session + admin check that returns (rather than throws) an error object. */
async function adminGate(t: Dictionary) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    return { error: t.errors.notAuthorized as string, session: null };
  }
  return { error: null, session };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "kategori"
  );
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (
    slug === EVENTS_CATEGORY_SLUG ||
    (await prisma.forumCategory.findUnique({ where: { slug } }))
  ) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

/**
 * Move a thread's assets into its folder, creating the folder lazily the first
 * time a post carries an image or attachment (mirrors calendar occurrences).
 */
async function ensureThreadFolder(
  thread: { id: string; title: string; folderId: string | null },
  parsed: ParsedContent,
  userId: string,
) {
  if (collectAssetIds(parsed).length === 0) return;
  let folderId = thread.folderId;
  if (!folderId) {
    const folder = await prisma.folder.create({
      data: { name: thread.title, createdById: userId },
    });
    folderId = folder.id;
    await prisma.forumThread.update({
      where: { id: thread.id },
      data: { folderId },
    });
  }
  await claimAssets(parsed, folderId, userId);
}

/* --- categories (admin) ---------------------------------------------------- */

export async function createCategory(formData: FormData) {
  const t = await getDict();
  const { error, session } = await adminGate(t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const name = str(formData, "name");
  if (!name || name.length > MAX_CATEGORY_NAME) {
    return { error: t.errors.invalidInput };
  }
  const description = str(formData, "description") || null;
  if (description && description.length > MAX_CATEGORY_DESC) {
    return { error: t.errors.invalidInput };
  }

  const slug = await uniqueSlug(name);
  const max = await prisma.forumCategory.aggregate({ _max: { order: true } });
  const category = await prisma.forumCategory.create({
    data: { slug, name, description, order: (max._max.order ?? 0) + 1 },
  });
  await logEvent({
    actorId: session.user.id,
    action: "forum.category.create",
    targetType: "forumCategory",
    targetId: category.id,
    meta: { name },
  });
  revalidatePath("/forum");
  return { ok: true };
}

export async function renameCategory(categoryId: string, formData: FormData) {
  const t = await getDict();
  const { error, session } = await adminGate(t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const category = await prisma.forumCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category) return { error: t.errors.categoryNotFound };
  if (category.isEvents) return { error: t.errors.eventsCategoryReadOnly };

  const name = str(formData, "name");
  if (!name || name.length > MAX_CATEGORY_NAME) {
    return { error: t.errors.invalidInput };
  }
  const description = str(formData, "description") || null;
  if (description && description.length > MAX_CATEGORY_DESC) {
    return { error: t.errors.invalidInput };
  }

  // Slug stays stable so existing URLs keep working.
  await prisma.forumCategory.update({
    where: { id: categoryId },
    data: { name, description },
  });
  await logEvent({
    actorId: session.user.id,
    action: "forum.category.rename",
    targetType: "forumCategory",
    targetId: categoryId,
    meta: { name },
  });
  revalidatePath("/forum");
  revalidatePath(`/forum/c/${category.slug}`);
  return { ok: true };
}

export async function deleteCategory(categoryId: string) {
  const t = await getDict();
  const { error, session } = await adminGate(t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const category = await prisma.forumCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category) return { error: t.errors.categoryNotFound };
  if (category.isEvents) return { error: t.errors.eventsCategoryReadOnly };

  // Threads (and their posts) cascade; thread folders survive via SetNull so
  // any images/attachments stay discoverable in the files section.
  await prisma.forumCategory.delete({ where: { id: categoryId } });
  await logEvent({
    actorId: session.user.id,
    action: "forum.category.delete",
    targetType: "forumCategory",
    targetId: categoryId,
    meta: { name: category.name },
  });
  revalidatePath("/forum");
  return { ok: true };
}

export async function reorderCategory(
  categoryId: string,
  direction: "up" | "down",
) {
  const t = await getDict();
  const { error, session } = await adminGate(t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  // The events section is pinned first and never reordered.
  const categories = await prisma.forumCategory.findMany({
    where: { isEvents: false },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const i = categories.findIndex((c) => c.id === categoryId);
  if (i === -1) return { error: t.errors.categoryNotFound };
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= categories.length) return { ok: true };

  const a = categories[i];
  const b = categories[j];
  await prisma.$transaction([
    prisma.forumCategory.update({ where: { id: a.id }, data: { order: b.order } }),
    prisma.forumCategory.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);
  revalidatePath("/forum");
  return { ok: true };
}

/* --- threads --------------------------------------------------------------- */

export async function createThread(categoryId: string, formData: FormData) {
  const t = await getDict();
  const session = await requireSession();

  const category = await prisma.forumCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category) return { error: t.errors.categoryNotFound };
  // Event threads are created only by the calendar, never by hand.
  if (category.isEvents) return { error: t.errors.eventsCategoryReadOnly };

  const title = str(formData, "title");
  if (!title || title.length > MAX_TITLE) return { error: t.errors.invalidInput };

  const parsed = parseContentFields(formData);
  if (!parsed || !parsed.contentJson) return { error: t.errors.invalidInput };

  const thread = await prisma.forumThread.create({
    data: {
      categoryId,
      title,
      createdById: session.user.id,
      posts: {
        create: { contentJson: parsed.contentJson, createdById: session.user.id },
      },
    },
  });
  await ensureThreadFolder(thread, parsed, session.user.id);
  await logEvent({
    actorId: session.user.id,
    action: "forum.thread.create",
    targetType: "forumThread",
    targetId: thread.id,
    meta: { title },
  });
  await notifyMembers({
    actorId: session.user.id,
    section: "forum",
    title: t.modules.forum.label,
    body: fmt(t.push.newThread, { name: session.user.name ?? "", title }),
    url: `/forum/t/${thread.id}`,
  });
  revalidatePath("/forum");
  revalidatePath(`/forum/c/${category.slug}`);
  return { ok: true, id: thread.id };
}

export async function createReply(threadId: string, formData: FormData) {
  const t = await getDict();
  const session = await requireSession();

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
  });
  if (!thread) return { error: t.errors.threadNotFound };
  const isAdmin = session.user.role === "ADMIN";
  if (thread.locked && !isAdmin) return { error: t.errors.threadLocked };

  const parsed = parseContentFields(formData);
  if (!parsed || !parsed.contentJson) return { error: t.errors.invalidInput };

  // Creating the post through the thread bumps the thread's @updatedAt, so
  // category listings sort it to the top by recent activity.
  await prisma.forumThread.update({
    where: { id: threadId },
    data: {
      posts: {
        create: {
          contentJson: parsed.contentJson,
          createdById: session.user.id,
        },
      },
    },
  });
  await ensureThreadFolder(thread, parsed, session.user.id);
  await logEvent({
    actorId: session.user.id,
    action: "forum.reply.create",
    targetType: "forumThread",
    targetId: threadId,
    meta: { title: thread.title },
  });
  await notifyMembers({
    actorId: session.user.id,
    section: "forum",
    title: t.modules.forum.label,
    body: fmt(t.push.newReply, {
      name: session.user.name ?? "",
      title: thread.title,
    }),
    url: `/forum/t/${threadId}`,
  });
  revalidatePath(`/forum/t/${threadId}`);
  revalidatePath("/forum");
  return { ok: true, id: threadId };
}

export async function deleteThread(threadId: string) {
  const t = await getDict();
  const session = await requireSession();

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    include: { category: { select: { slug: true } } },
  });
  if (!thread) return { error: t.errors.threadNotFound };
  const isAdmin = session.user.role === "ADMIN";
  if (thread.createdById !== session.user.id && !isAdmin) {
    return { error: t.errors.ownPostsOnly };
  }

  // Posts cascade; the folder survives (SetNull) so assets stay in /files.
  await prisma.forumThread.delete({ where: { id: threadId } });
  await logEvent({
    actorId: session.user.id,
    action: "forum.thread.delete",
    targetType: "forumThread",
    targetId: threadId,
    meta: { title: thread.title },
  });
  revalidatePath("/forum");
  revalidatePath(`/forum/c/${thread.category.slug}`);
  return { ok: true, redirect: `/forum/c/${thread.category.slug}` };
}

async function setThreadFlag(
  threadId: string,
  data: { pinned?: boolean; locked?: boolean },
) {
  const t = await getDict();
  const { error, session } = await adminGate(t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    include: { category: { select: { slug: true } } },
  });
  if (!thread) return { error: t.errors.threadNotFound };

  await prisma.forumThread.update({ where: { id: threadId }, data });
  revalidatePath("/forum");
  revalidatePath(`/forum/c/${thread.category.slug}`);
  revalidatePath(`/forum/t/${threadId}`);
  return { ok: true };
}

export async function setThreadPinned(threadId: string, pinned: boolean) {
  return setThreadFlag(threadId, { pinned });
}

export async function setThreadLocked(threadId: string, locked: boolean) {
  return setThreadFlag(threadId, { locked });
}

/* --- posts ----------------------------------------------------------------- */

export async function updatePost(postId: string, formData: FormData) {
  const t = await getDict();
  const session = await requireSession();

  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    include: { thread: true },
  });
  if (!post) return { error: t.errors.postNotFound };
  const isAdmin = session.user.role === "ADMIN";
  if (post.createdById !== session.user.id && !isAdmin) {
    return { error: t.errors.ownPostsOnly };
  }

  const parsed = parseContentFields(formData);
  if (!parsed || !parsed.contentJson) return { error: t.errors.invalidInput };

  await prisma.forumPost.update({
    where: { id: postId },
    data: { contentJson: parsed.contentJson, editedAt: new Date() },
  });
  await ensureThreadFolder(post.thread, parsed, session.user.id);
  await logEvent({
    actorId: session.user.id,
    action: "forum.post.update",
    targetType: "forumPost",
    targetId: postId,
  });
  revalidatePath(`/forum/t/${post.threadId}`);
  return { ok: true, id: post.threadId };
}

export async function deletePost(postId: string) {
  const t = await getDict();
  const session = await requireSession();

  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    include: {
      thread: {
        include: {
          category: { select: { slug: true } },
          _count: { select: { posts: true } },
        },
      },
    },
  });
  if (!post) return { error: t.errors.postNotFound };
  const isAdmin = session.user.role === "ADMIN";
  if (post.createdById !== session.user.id && !isAdmin) {
    return { error: t.errors.ownPostsOnly };
  }

  const thread = post.thread;
  // A normal thread with no posts left has no body, so remove it entirely.
  // Event threads keep their live-event body, so they survive an empty reply
  // list. The thread's folder survives either way (SetNull).
  if (thread.eventId === null && thread._count.posts <= 1) {
    await prisma.forumThread.delete({ where: { id: thread.id } });
    await logEvent({
      actorId: session.user.id,
      action: "forum.thread.delete",
      targetType: "forumThread",
      targetId: thread.id,
      meta: { title: thread.title },
    });
    revalidatePath("/forum");
    revalidatePath(`/forum/c/${thread.category.slug}`);
    return { ok: true, redirect: `/forum/c/${thread.category.slug}` };
  }

  await prisma.forumPost.delete({ where: { id: postId } });
  await logEvent({
    actorId: session.user.id,
    action: "forum.post.delete",
    targetType: "forumPost",
    targetId: postId,
  });
  revalidatePath(`/forum/t/${thread.id}`);
  return { ok: true };
}

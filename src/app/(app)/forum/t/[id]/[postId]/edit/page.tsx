import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { PostEditForm } from "@/modules/forum/post-edit-form";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const session = await requireSession();
  const { id, postId } = await params;
  const t = await getDict();

  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post || post.threadId !== id) notFound();

  const isAdmin = session.user.role === "ADMIN";
  if (post.createdById !== session.user.id && !isAdmin) {
    redirect(`/forum/t/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/forum/t/${id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.forum.backToThread}
      </Link>
      <PageTitle>{t.forum.editPost}</PageTitle>
      <PostEditForm
        postId={post.id}
        threadId={id}
        initialContent={post.contentJson}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { ThreadForm } from "@/modules/forum/thread-form";

export default async function NewThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireSession();
  const { slug } = await params;
  const t = await getDict();

  const category = await prisma.forumCategory.findUnique({ where: { slug } });
  // The events section only receives threads from the calendar, never by hand.
  if (!category || category.isEvents) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/forum/c/${category.slug}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {category.name}
      </Link>
      <PageTitle>{t.forum.newThread}</PageTitle>
      <ThreadForm categoryId={category.id} />
    </div>
  );
}

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PasswordForm, ProfileForm } from "@/modules/profile/profile-forms";

export default async function ProfilePage() {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-3xl font-bold">Your profile</h1>
      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <ProfileForm defaultName={user.name} defaultBio={user.bio ?? ""} />
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}

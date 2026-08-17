import { requireSession, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { hostOf, siteOrigin } from "@/lib/site-url";
import { btnDangerOutline, cardPad, PageTitle } from "@/components/ui";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogOutIcon } from "@/components/icons";
import { AvatarForm, PasswordForm, ProfileForm } from "@/modules/profile/profile-forms";
import { avatarUrlFor } from "@/components/avatar";
import { CalendarFeed } from "@/modules/profile/calendar-feed";
import { NotificationSettings } from "@/modules/notifications/notification-settings";

export default async function ProfilePage() {
  const session = await requireSession();
  const t = await getDict();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });

  const origin = await siteOrigin();
  const feedPath = user.calendarToken
    ? `/api/calendar/feed/${user.calendarToken}`
    : null;
  const httpsUrl = feedPath && origin ? `${origin}${feedPath}` : null;
  const webcalUrl =
    feedPath && origin ? `webcal://${hostOf(origin)}${feedPath}` : null;

  return (
    <div className="max-w-lg">
      <PageTitle>{t.profile.title}</PageTitle>
      <section className={`${cardPad} mb-6`}>
        <h2 className="mb-1 text-lg font-semibold text-white">
          {t.profile.avatarTitle}
        </h2>
        <AvatarForm
          userId={user.id}
          userName={user.name}
          avatarUrl={avatarUrlFor(user)}
        />
      </section>
      <section className={`${cardPad} mb-6`}>
        <ProfileForm defaultName={user.name} defaultBio={user.bio ?? ""} />
      </section>
      <section className={`${cardPad} mb-6`}>
        <h2 className="mb-4 text-lg font-semibold text-white">
          {t.profile.changePassword}
        </h2>
        <PasswordForm />
      </section>
      <section className={`${cardPad} mb-6`}>
        <h2 className="mb-1 text-lg font-semibold text-white">
          {t.profile.calendarFeed.title}
        </h2>
        <CalendarFeed httpsUrl={httpsUrl} webcalUrl={webcalUrl} />
      </section>
      <section className={`${cardPad} mb-6`}>
        <h2 className="mb-1 text-lg font-semibold text-white">
          {t.profile.notifications.title}
        </h2>
        <NotificationSettings
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        />
      </section>
      <section className={`${cardPad} mb-6`}>
        <h2 className="mb-1 text-lg font-semibold text-white">
          {t.profile.language}
        </h2>
        <p className="mb-4 text-sm text-zinc-400">{t.profile.languageHint}</p>
        <LocaleSwitcher />
      </section>
      <section className={cardPad}>
        <h2 className="mb-4 text-lg font-semibold text-white">
          {t.profile.account}
        </h2>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className={btnDangerOutline}>
            <LogOutIcon className="h-4 w-4" />
            {t.common.signOut}
          </button>
        </form>
      </section>
    </div>
  );
}

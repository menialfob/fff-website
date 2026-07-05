import { headers } from "next/headers";
import { requireSession, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { btnDangerOutline, cardPad, PageTitle } from "@/components/ui";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogOutIcon } from "@/components/icons";
import { PasswordForm, ProfileForm } from "@/modules/profile/profile-forms";
import { CalendarFeed } from "@/modules/profile/calendar-feed";

export default async function ProfilePage() {
  const session = await requireSession();
  const t = await getDict();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const feedPath = user.calendarToken
    ? `/api/calendar/feed/${user.calendarToken}`
    : null;
  const httpsUrl = feedPath && host ? `${proto}://${host}${feedPath}` : null;
  const webcalUrl = feedPath && host ? `webcal://${host}${feedPath}` : null;

  return (
    <div className="max-w-lg">
      <PageTitle>{t.profile.title}</PageTitle>
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

import { getDict } from "@/lib/i18n/server";
import { safeCallbackPath } from "@/lib/callback-url";
import { Brand } from "@/components/ui";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const t = await getDict();
  // The middleware parks the page a member was trying to reach here, so a deep
  // link into the app survives the detour through the form.
  const callbackUrl = safeCallbackPath((await searchParams).callbackUrl);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-3xl shadow-lg shadow-orange-500/25">
            🍻
          </span>
          <div>
            <Brand className="text-3xl" />
          </div>
          <p className="mt-2 text-sm text-zinc-400">{t.login.tagline}</p>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
      <LocaleSwitcher />
    </main>
  );
}

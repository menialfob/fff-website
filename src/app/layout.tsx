import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { dictionaries } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { BackgroundGlow } from "@/components/ui";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "FFF",
  description: "Hjemsted for Fælles Formiddags Fædre",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FFF", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c0a12",
  // Required for env(safe-area-inset-*) to resolve to real values. Without it
  // the insets are 0, so in the standalone Home Screen app (which renders
  // edge-to-edge under the black-translucent status bar) the bottom tab bar's
  // safe-area padding does nothing and the icons get clipped by the rounded
  // corners / home indicator. In the browser Safari already avoids the unsafe
  // regions, so the existing header/nav padding keeps it looking identical.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={outfit.variable}>
      <body>
        <BackgroundGlow />
        <I18nProvider locale={locale} dict={dictionaries[locale]}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}

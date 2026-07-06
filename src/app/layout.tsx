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
  description: "Privat side for vennegruppen",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FFF", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c0a12",
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

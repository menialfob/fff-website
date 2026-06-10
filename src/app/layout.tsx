import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FFF",
  description: "Private site for our friend group",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

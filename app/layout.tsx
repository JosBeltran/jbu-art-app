import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  IBM_Plex_Mono,
} from "next/font/google";
import ClientLayout from "./ClientLayout";

import "@carbon/styles/css/styles.css";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.josuebeltranuresti.com"),
  title: {
    default: "Josué Beltrán Uresti | Contemporary Artist & Creative in Monterrey",
    template: "%s | Josué Beltrán Uresti",
  },
  description:
    "Official website of Josué Beltrán Uresti, contemporary artist and creative based in Monterrey, Mexico. Original paintings, mixed media, resin art and art objects.",
  openGraph: { siteName: "Josué Beltrán Uresti", locale: "es_MX", alternateLocale: ["en_US"] },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const acceptLanguage = requestHeaders.get("accept-language") || "";
  const initialLocales = acceptLanguage.split(",").map((entry) => entry.split(";")[0].trim()).filter(Boolean);
  const initialLang = initialLocales.find((entry) => /^(es|en)(-|$)/i.test(entry))?.slice(0, 2).toLowerCase() || "en";
  return (
    <html
      lang={initialLang}
      suppressHydrationWarning
      className={`
        ${plexSans.variable}
        ${plexSerif.variable}
        ${plexMono.variable}
        h-full antialiased
      `}
    >
      <body suppressHydrationWarning>
        <ClientLayout initialLocales={initialLocales}>{children}</ClientLayout>
      </body>
    </html>
  );
}


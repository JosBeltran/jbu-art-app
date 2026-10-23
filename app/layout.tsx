import type { Metadata } from "next";
import {
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  IBM_Plex_Mono,
} from "next/font/google";
import ClientLayout from "./ClientLayout";
import { Analytics } from "@vercel/analytics/react";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`
        ${plexSans.variable}
        ${plexSerif.variable}
        ${plexMono.variable}
        h-full antialiased
      `}
    >
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
        <Analytics />
      </body>
    </html>
  );
}


import type { Metadata } from "next";
import "./globals.css";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title: "Castle Knockout — Playable H5 Demo",
  description: "Aim, fire, and bring the castle down in this playful physics puzzle demo.",
  icons: {
    icon: `${siteUrl}/favicon.svg`,
    shortcut: `${siteUrl}/favicon.svg`,
  },
  openGraph: {
    title: "Castle Knockout — Playable H5 Demo",
    description: "Aim, fire, and bring the castle down.",
    type: "website",
    url: siteUrl,
    images: [{ url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: "Castle Knockout game preview" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Castle Knockout — Playable H5 Demo",
    description: "Aim, fire, and bring the castle down.",
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Castle Knockout — Playable H5 Demo",
  description: "Aim, fire, and bring the castle down in this playful physics puzzle demo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Castle Knockout — Playable H5 Demo",
    description: "Aim, fire, and bring the castle down.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Castle Knockout game preview" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Castle Knockout — Playable H5 Demo",
    description: "Aim, fire, and bring the castle down.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

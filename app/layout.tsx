import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: { default: "Royal Exchange — Live Crown Market", template: "%s · Royal Exchange" },
    description: "A continuous fictional market for historically grounded medieval guilds and colony trades.",
    openGraph: {
      title: "Royal Exchange — Live Crown Market",
      description: "A continuous fictional market for medieval guilds and colony trades.",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Royal Exchange live Crown Market" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Royal Exchange — Live Crown Market",
      description: "A continuous fictional market for medieval guilds and colony trades.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}

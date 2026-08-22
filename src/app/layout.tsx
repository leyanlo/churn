import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://milkdrop.leyanlo.com"),
  title: "Churn — Music, visualized",
  description:
    "An unofficial browser visualizer powered by Butterchurn and classic MilkDrop presets.",
  applicationName: "Churn",
  authors: [{ name: "Leyan Lo", url: "https://leyanlo.com" }],
  openGraph: {
    title: "Churn",
    description: "An unofficial visualizer powered by Butterchurn.",
    url: "https://milkdrop.leyanlo.com",
    siteName: "Churn",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Churn",
    description: "An unofficial visualizer powered by Butterchurn.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050506",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

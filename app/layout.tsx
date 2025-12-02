import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// Re-enable Vercel Analytics (previously removed). Keep SSR disabled for analytics.
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "next-themes";
import { ConvexClientProvider } from "./convex-provider";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GITA - Generated Important Topics Through AI",
  description:
    "Transform your syllabus into an interactive constellation visualization with AI-powered topic analysis and exam-ready answers",
  generator: "v0.app",
  keywords: ["syllabus", "AI", "learning", "visualization", "exam prep"],
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "icon.jpeg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="m-0 p-0">
      <body className="m-0 p-0 font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ConvexClientProvider>{children}</ConvexClientProvider>
          {/* Vercel Analytics: collects pageviews and SPA navigations */}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}

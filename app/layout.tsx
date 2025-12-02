import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AnalyticsClient from "@/components/analytics-client";
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
    // Use the available `icon.jpeg` from the `public/` folder for all fallbacks
    icon: [{ url: "/icon.jpeg" }],
    apple: "/icon.jpeg",
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
          {/* Vercel Analytics: load only when NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS=1 */}
          <AnalyticsClient
            enabled={process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "1"}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

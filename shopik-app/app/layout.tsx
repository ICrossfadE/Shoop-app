import CacheBoundary from './components/CacheBoundary';
import type { Metadata } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { readTheme } from '@/lib/server-theme';

// Self-host the shared font, including Ukrainian glyphs.
const geistSans = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shopik",
  description: "Спільний список покупок",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme } = await readTheme();
  return (
    <html
      lang="uk"
      data-theme={theme}
      style={{ colorScheme: theme }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><CacheBoundary />{children}</body>
    </html>
  );
}

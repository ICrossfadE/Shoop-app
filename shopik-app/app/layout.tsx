import ThemeProvider from './components/ThemeProvider';
import { themeColorScheme } from '@/lib/theme';
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
  // Resolve shared image URLs against the stable production domain on Vercel.
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000'),
  title: "Shopik",
  description: "Спільний список покупок",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme, userId } = await readTheme();
  return (
    <html
      lang="uk"
      data-theme={theme}
      style={{ colorScheme: themeColorScheme(theme) }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><ThemeProvider key={userId} initial={theme}><CacheBoundary />{children}</ThemeProvider></body>
    </html>
  );
}

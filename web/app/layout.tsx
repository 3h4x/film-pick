import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Movies Organizer",
  description: "Movie and series recommendation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="mt-auto border-t border-gray-800/50 py-6 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-600">
            <span>Movies Organizer</span>
            <span>Data from TMDb &amp; Filmweb</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "World + persona",
  description: "A world-model game: LingBot-World-2, Vidu-S2-Avatar and Fast-H3 on Reactor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

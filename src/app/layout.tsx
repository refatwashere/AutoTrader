import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "VORTEX // ALPHA — Autonomous Crypto & Meme-Coin Sniper Terminal",
  description:
    "Autonomous multi-chain crypto and meme-coin viability radar, anti-rug contract auditor, and automated profit execution bot.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="bg-[#090B10] text-[#F1F5F9] font-sans antialiased selection:bg-[#10B981]/30 selection:text-[#10B981]">
        {children}
      </body>
    </html>
  );
}

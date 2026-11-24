import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Literata } from "next/font/google";
import * as React from "react";
import { Providers } from "../components/providers";
import { messages } from "../messages/pt-br";
import "./globals.css";
import { headers } from "next/headers";

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: messages.appName,
  description: messages.tagline,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      data-nonce={nonce}
      className={`${literata.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-ground font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

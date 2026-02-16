import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Шаблон Next.js для ИИ-разработки",
  description: "Современный шаблон Next.js с TypeScript, Tailwind CSS и shadcn/ui для быстрого старта.",
  keywords: ["Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "ИИ-разработка", "React"],
  authors: [{ name: "Команда проекта" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Шаблон Next.js для ИИ-разработки",
    description: "Современный стек React для продуктивной разработки",
    url: "http://localhost:3000",
    siteName: "Code Scaffold",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Шаблон Next.js для ИИ-разработки",
    description: "Современный стек React для продуктивной разработки",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

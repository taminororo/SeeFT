import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "SeeFT",
  description: "技大祭スタッフ向けアプリ",
};

export const viewport: Viewport = {
  themeColor: "#009688",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        {/* スマホ幅のカラムに収め、デスクトップでも「アプリらしい」見た目にする */}
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-base shadow-card">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}

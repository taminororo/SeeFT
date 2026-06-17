"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { AppHeader } from "@/components/app-header";

// Flutter 版 `layout.dart` の移植。4 タブ共通レイアウト＋認証ガード。
// AppBar はマニュアル / その他タブのみ表示（マイシフト / 緊急時対応では非表示）。

const HEADER_TITLES: Record<string, string> = {
  "/manuals": "マニュアル",
  "/etc": "その他",
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, signedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !signedIn) {
      router.replace("/sign-in");
    }
  }, [ready, signedIn, router]);

  // 読込前 or 未ログインはリダイレクト待ち（何も描画しない）
  if (!ready || !signedIn) {
    return null;
  }

  const title = HEADER_TITLES[pathname];

  return (
    <>
      {title && <AppHeader title={title} />}
      <main className="flex flex-1 flex-col">{children}</main>
      <BottomNav />
    </>
  );
}

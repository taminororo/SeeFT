"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isSignedIn } from "@/lib/storage";

// Flutter 版 `FirstJumpSelector` の移植。保存済み userID の有無で振り分ける。
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isSignedIn() ? "/shifts" : "/sign-in");
  }, [router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <h1 className="text-lg font-bold text-main">SeeFT</h1>
      <p className="text-sm text-gray-dark">読み込み中...</p>
    </div>
  );
}

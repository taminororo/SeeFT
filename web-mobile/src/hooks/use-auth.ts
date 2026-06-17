"use client";

import { useSyncExternalStore } from "react";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  signInStore,
  signOutStore,
  subscribeAuth,
} from "@/lib/auth-store";

// 認証状態フック。Flutter 版 `FirstJumpSelector` / `permanent_store` に相当。
// localStorage を外部ストアとして購読する。ready が false の間は
// リダイレクト判定を保留し、hydration 不一致とログイン済みの誤リダイレクトを避ける。

export function useAuth() {
  const { userID, roleID, ready } = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  return {
    userID,
    roleID,
    ready,
    signedIn: ready && userID !== 0,
    signIn: signInStore,
    signOut: signOutStore,
  };
}

// 認証状態の外部ストア（localStorage を購読可能にしたラッパー）。
// useSyncExternalStore から使う。同一タブ内の更新も signIn/signOut が通知する。
// SSR/hydration では ready:false のサーバスナップショットを返し、
// クライアントで初回購読時に実値を読む（ログイン済みユーザーの誤リダイレクトを防ぐ）。

import { clearAuth, getRoleID, getUserID, setRoleID, setUserID } from "./storage";

export type AuthSnapshot = {
  userID: number;
  roleID: number;
  ready: boolean;
};

// 参照を安定させるための固定サーバスナップショット。
const SERVER_SNAPSHOT: AuthSnapshot = { userID: 0, roleID: 0, ready: false };

let cached: AuthSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function computeSnapshot(): AuthSnapshot {
  return { userID: getUserID(), roleID: getRoleID(), ready: true };
}

function emitChange(): void {
  cached = computeSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAuth(listener: () => void): () => void {
  // 初回購読時に localStorage から実値を読み込む（クライアントのみ）。
  if (!cached.ready) {
    cached = computeSnapshot();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthSnapshot {
  return cached;
}

export function getAuthServerSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOT;
}

export function signInStore(id: number, role: number): void {
  setUserID(id);
  setRoleID(role);
  emitChange();
}

export function signOutStore(): void {
  clearAuth();
  emitChange();
}

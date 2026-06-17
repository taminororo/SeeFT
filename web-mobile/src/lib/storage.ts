// localStorage ラッパー。Flutter 版 `SharedPreferences`（permanent_store.dart）の移植。
// userID が 0 のとき未ログイン、という番兵値の扱いも踏襲する。
// SSR でも壊れないよう window の有無をガードする。

const USER_ID_KEY = "userID";
const ROLE_ID_KEY = "roleID";

function readInt(key: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(key);
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function writeInt(key: string, value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

export function getUserID(): number {
  return readInt(USER_ID_KEY);
}

export function setUserID(id: number): void {
  writeInt(USER_ID_KEY, id);
}

export function getRoleID(): number {
  return readInt(ROLE_ID_KEY);
}

export function setRoleID(id: number): void {
  writeInt(ROLE_ID_KEY, id);
}

/** userID が 0 以外なら署名済みとみなす（Flutter `isUserID()` 相当）。 */
export function isSignedIn(): boolean {
  return getUserID() !== 0;
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_ID_KEY);
  window.localStorage.removeItem(ROLE_ID_KEY);
}

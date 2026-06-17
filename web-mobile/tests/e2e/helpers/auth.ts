import type { BrowserContext, Page } from "@playwright/test";

// E2E 用の認証ヘルパー。
// (main) レイアウトの認証ガードは localStorage の userID / roleID を
// Number.parseInt で読む（src/lib/storage.ts）。userID が 0 以外なら
// signedIn とみなされるため、ナビゲーション前に addInitScript で
// localStorage を仕込んでおけばガードを通過できる。
//
// addInitScript はページ読み込みのたびに（=ドキュメント生成前に）走るので、
// SSR 後のクライアント初回購読時には既に値が入っている。

/** Page か BrowserContext のどちらでも addInitScript を呼べるように受ける。 */
type InitScriptTarget = Pick<Page, "addInitScript"> | Pick<BrowserContext, "addInitScript">;

/** 認証ガード（userID !== 0）を通すための既定値。 */
const DEFAULT_USER_ID = "1";
const DEFAULT_ROLE_ID = "1";

export interface AuthOptions {
  userID?: string;
  roleID?: string;
}

/**
 * 認証情報を localStorage に注入する。
 * ナビゲーション（page.goto 等）の前に呼ぶこと。
 *
 * @example
 *   await injectAuth(page);
 *   await page.goto("/shifts");
 */
export async function injectAuth(
  target: InitScriptTarget,
  options: AuthOptions = {},
): Promise<void> {
  const userID = options.userID ?? DEFAULT_USER_ID;
  const roleID = options.roleID ?? DEFAULT_ROLE_ID;
  await target.addInitScript(
    ([uid, rid]: [string, string]) => {
      window.localStorage.setItem("userID", uid);
      window.localStorage.setItem("roleID", rid);
    },
    [userID, roleID] as [string, string],
  );
}

/**
 * 任意の localStorage キーを 1 つ注入する（例: reviewed_tasks）。
 * 値は文字列で渡す（JSON を入れたい場合は呼び出し側で stringify 済みにする）。
 * ナビゲーションの前に呼ぶこと。
 *
 * @example
 *   await setLocalStorageItem(page, "reviewed_tasks", JSON.stringify([1, 2]));
 *   await page.goto("/shifts");
 */
export async function setLocalStorageItem(
  target: InitScriptTarget,
  key: string,
  value: string,
): Promise<void> {
  await target.addInitScript(
    ([k, v]: [string, string]) => {
      window.localStorage.setItem(k, v);
    },
    [key, value] as [string, string],
  );
}

/**
 * 複数の localStorage キーをまとめて注入する。
 * 値はすべて文字列で渡す。ナビゲーションの前に呼ぶこと。
 *
 * @example
 *   await setLocalStorageItems(page, {
 *     reviewed_tasks: JSON.stringify([1, 2]),
 *   });
 */
export async function setLocalStorageItems(
  target: InitScriptTarget,
  entries: Record<string, string>,
): Promise<void> {
  await target.addInitScript((pairs: Record<string, string>) => {
    for (const [k, v] of Object.entries(pairs)) {
      window.localStorage.setItem(k, v);
    }
  }, entries);
}

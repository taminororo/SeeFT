import { test, expect, type Page } from "@playwright/test";

// ログイン画面（/sign-in）の E2E。Flutter 版 sign_in_page.dart の移植先 src/app/sign-in/page.tsx を
// オラクルに、「実際の POST /mail_auth/signin → 成功時 /shifts へ replace、失敗時はエラー文言表示」を
// 検証する。localStorage 注入によるショートカットではなく、シードされた実 API に対する本物の signin を
// 通す（spec1 はセッション行を 1 件作るが、検証の主目的が実フローのため許容する）。
//
// helpers/auth は使わない。Node 23 + Playwright 1.61 の相対 TS インポート不具合
// （"context.conditions?.includes is not a function"）を避けるため、必要なものはインライン化する。
//
// シード前提: ユーザー 1 ＝ 学籍番号 12345678 / パスワード 123456（id=1, roleID=1）。
// 環境変数で上書き可能（CI で別シードを使う場合に備える）。
const STUDENT_NUMBER = process.env.E2E_STUDENT_NUMBER ?? "12345678";
const PASSWORD = process.env.E2E_PASSWORD ?? "123456";

// page.tsx 23 行目の AUTH_ERROR。signin が {id} を返さないとき app が表示する。
const AUTH_ERROR = "学籍番号もしくはパスワードが違います";

// localStorage の生値を取り出す（未設定なら null）。
// auth-store.ts の signInStore → storage.ts の setUserID/setRoleID で String(value) 保存される。
function readLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

// 重要な実機エッジ: ハイドレーション前に「ログイン」を押すと form がネイティブ GET 送信になり
// （資格情報が URL に乗り）ログインが起きない。そのため goto 後にハイドレーション完了を待つ。
async function gotoSignInHydrated(page: Page): Promise<void> {
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
}

test.describe("ログインフロー（実 signin API）", () => {
  test("正しい資格情報で signin → /shifts へ遷移し userID/roleID が永続化される", async ({
    page,
  }) => {
    await gotoSignInHydrated(page);

    // 学籍番号フィールド（TextField の label="学籍番号" が htmlFor で input と紐づく）。
    await page.getByLabel("学籍番号").fill(STUDENT_NUMBER);

    // パスワードは exact 必須。トグルボタンの aria-label（"パスワードを表示"/"パスワードを隠す"）も
    // "パスワード" を部分一致するため、exact:false だと strict mode 違反になる。
    await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD);

    // 実 API を叩く（route mock なし）。成功時 onSubmit が router.replace("/shifts")。
    await page.getByRole("button", { name: "ログイン" }).click();

    await page.waitForURL("**/shifts");

    // signInStore(user.id, user.roleID) → localStorage に String 値で保存される。
    // シードユーザー 1 なので "1" / "1"。
    await expect.poll(() => readLocalStorage(page, "userID")).toBe("1");
    expect(await readLocalStorage(page, "roleID")).toBe("1");
  });

  test("誤ったパスワードではエラー文言が出て /sign-in に留まる", async ({
    page,
  }) => {
    await gotoSignInHydrated(page);

    await page.getByLabel("学籍番号").fill(STUDENT_NUMBER);
    await page.getByLabel("パスワード", { exact: true }).fill("wrongpass");

    await page.getByRole("button", { name: "ログイン" }).click();

    // signin が {id} を返さない → onSubmit が setFormError(AUTH_ERROR)。
    await expect(page.getByText(AUTH_ERROR)).toBeVisible();

    // リダイレクトは起きず /sign-in のまま。
    expect(new URL(page.url()).pathname).toBe("/sign-in");

    // 認証は確立されない（userID は未設定のまま）。
    expect(await readLocalStorage(page, "userID")).toBeNull();
  });
});

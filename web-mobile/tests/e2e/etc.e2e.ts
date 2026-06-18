import { test, expect, type Page } from "@playwright/test";
// 認証ヘルパーをインライン化（Node 23 + Playwright 1.61 の相対 TS インポート不具合
// "context.conditions?.includes is not a function" を回避。ツールチェーン修正後は
// ./helpers/auth から import に戻せる）。
async function injectAuth(
  page: Page,
  options: { userID?: string; roleID?: string } = {},
): Promise<void> {
  const userID = options.userID ?? "1";
  const roleID = options.roleID ?? "1";
  await page.addInitScript(([uid, rid]: [string, string]) => {
    window.localStorage.setItem("userID", uid);
    window.localStorage.setItem("roleID", rid);
  }, [userID, roleID] as [string, string]);
}

// その他画面（/etc）の E2E。Flutter 版 etc_page.dart の移植先 src/app/(main)/etc/page.tsx を
// オラクルに、(1) 外部リンク（操作説明 / 全体シフト）、(2) ログアウトを検証する。
//
// 移植上の差異:
// - Flutter は url_launcher の launch() でアプリ外ブラウザを開く。Web 版は <a target>
//   ではなく window.open(url, "_blank", "noopener,noreferrer")（page.tsx 16-18 行目）で
//   新規タブを開く。したがってリンク検証は <a href> ではなく、クリック時に新規 page
//   （ポップアップ）が開くことを context.waitForEvent("page") で捕捉して行う。
// - URL は config.ts の既定（NEXT_PUBLIC_* 未設定時）で seeftInstructionsUrl /
//   wholeShiftUrl ともに https://example.com。実ネットワークへ出ないよう example.com を
//   route で固定のスタブに差し替える（ポップアップが実 GET を出すのを避ける）。
// - ログアウトは Flutter の Navigator.pushNamedAndRemoveUntil(..., '/signin') 相当。
//   Web 版は signOut()（auth-store.signOutStore → storage.clearAuth で userID/roleID を
//   removeItem）後に router.replace("/sign-in")。(main)/layout.tsx の認証ガードも
//   未ログインで /sign-in へ飛ばすため、二重に /sign-in 遷移が担保される。

// config.ts の既定 URL（NEXT_PUBLIC_SEEFT_INSTRUCTIONS_URL / WHOLE_SHIFT_URL 未設定時）。
const EXTERNAL_URL = "https://example.com";

// example.com への実アクセスを避けるため、ポップアップが叩く URL を空ページに固定する。
// ホスト依存を避けたいが example.com は固定既定値なのでホスト名で素直に拾う。
const EXTERNAL_GLOB = "**/example.com/**";

// /etc を開く共通下ごしらえ: 認証注入＋外部 URL のスタブ化。
// addInitScript / route はいずれも goto より前に仕込むこと。
async function setupEtcPage(page: Page): Promise<void> {
  // userID=1 / roleID=1 を注入して (main) の認証ガードを通す。
  await injectAuth(page, { userID: "1", roleID: "1" });

  // 操作説明 / 全体シフトのポップアップが example.com へ実 GET を出すのを防ぐ。
  await page.route(EXTERNAL_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>stub</title>",
    });
  });
}

// localStorage の生値を取り出す（未設定なら null）。
function readLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

test.describe("その他画面", () => {
  test("操作説明 / 全体シフトは window.open で新規タブを開く", async ({
    page,
    context,
  }) => {
    await setupEtcPage(page);
    await page.goto("/etc");

    // 3 項目（操作説明 / 全体シフト / ログアウト）が描画される。
    await expect(
      page.getByRole("button", { name: "操作説明" }),
    ).toBeVisible();

    // 操作説明クリック → 新規 page（ポップアップ）が開き、URL は外部 URL。
    const [instructionsPopup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: "操作説明" }).click(),
    ]);
    expect(instructionsPopup.url()).toContain(EXTERNAL_URL.replace(/^https?:\/\//, ""));
    await instructionsPopup.close();

    // 元ページに留まる（新規タブで開くだけで遷移しない）。
    expect(new URL(page.url()).pathname).toBe("/etc");

    // 全体シフトクリック → 同様に新規 page が開く。
    const [wholeShiftPopup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: "全体シフト" }).click(),
    ]);
    expect(wholeShiftPopup.url()).toContain(EXTERNAL_URL.replace(/^https?:\/\//, ""));
    await wholeShiftPopup.close();

    expect(new URL(page.url()).pathname).toBe("/etc");
  });

  test("ログアウトで userID/roleID が消え、/sign-in へリダイレクトされる", async ({
    page,
  }) => {
    await setupEtcPage(page);
    await page.goto("/etc");

    // ログイン済みなので userID/roleID は注入値のまま。
    await expect(
      page.getByRole("button", { name: "ログアウト" }),
    ).toBeVisible();
    expect(await readLocalStorage(page, "userID")).toBe("1");
    expect(await readLocalStorage(page, "roleID")).toBe("1");

    // ログアウト → signOut()（clearAuth で removeItem）＋ router.replace("/sign-in")。
    await page.getByRole("button", { name: "ログアウト" }).click();

    // /sign-in へ遷移する（signOut 後の replace と (main) ガードの双方が担保）。
    await page.waitForURL("**/sign-in");

    // userID/roleID は removeItem されて null になる。
    await expect.poll(() => readLocalStorage(page, "userID")).toBeNull();
    expect(await readLocalStorage(page, "roleID")).toBeNull();
  });
});

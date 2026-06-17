import { test, expect, type Locator, type Page } from "@playwright/test";
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

// レスキュー送信フォームの E2E。Flutter 版 `rescue_request_tab/tab_pages/{trouble,question,shorthanded}.dart`
// のバリデーション挙動（src/components/rescue/rescue-request.tsx に移植）をブラウザ越しに検証する。
//
// 前提:
// - 認証は userID=1 / roleID=1 を localStorage に注入して (main) のガードを通す。
// - 「人が来ない」のタスク判定はドロップダウンの既定値（id 0 のプレースホルダ
//   「タスクを選択してください」）に依存する。テストは一切ドロップダウンを操作
//   しないので、/tasks/users/1 が null（→ [] に正規化されプレースホルダのみ）でも
//   実タスクを返しても、選択 id は 0 のまま = 同じ分岐を通る。
// - トースト（sonner）は画面上部中央に出る。本文テキストは select の <option> と
//   衝突しうる（例:「タスクを選択してください」）ため、トーストは
//   [data-sonner-toaster] 配下に限定して掴む。
// - 送信成功時は POST /rescues (201) という実副作用が発生する（許容）。
//
// 各テストは select-type 画面から個別に始める。種類ごとに /rescue を再読込し、
// 「レスキューを送信する」→ 種類選択 → 当該種類、という共通導線を辿る。

// sonner のトースト領域に限定したロケータ。select の <option> 等との
// テキスト衝突（strict mode violation）を避ける。
function toast(page: Page, text: string): Locator {
  return page.locator("[data-sonner-toaster]").getByText(text);
}

// 種類選択画面まで遷移する（request タブのホーム → 種類選択）。
async function gotoSelectType(page: Page): Promise<void> {
  await injectAuth(page, { userID: "1", roleID: "1" });
  // POST /rescues は dev では GAS 連携が無く 200 を返す（rescue_unified_controller.go:318:
  // GAS 失敗時は 200「saved to DB, but failed to spreadsheet」、成功時のみ 201）。
  // アプリは Flutter 同様 201 を成功とする（本番は GAS 成功で 201）。dev の GAS 不在に
  // 依存せず成功パスを決定的に検証するため、POST のみ 201 にモックする。GET は通す。
  await page.route("**/rescues", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "ok", data: {} }),
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/rescue");
  // request タブが既定。ホームの「レスキューを送信する」を押して種類選択へ。
  await page.getByRole("button", { name: "レスキューを送信する" }).click();
  await expect(
    page.getByText("発生した問題の種類を選択してください"),
  ).toBeVisible();
}

test.describe("レスキュー送信フォームのバリデーション", () => {
  test("トラブル: 未入力で送信するとエラー、両フィールド入力で成功", async ({
    page,
  }) => {
    await gotoSelectType(page);

    // 種類選択でトラブルを選ぶ。
    await page.getByRole("button", { name: "トラブル" }).click();
    await expect(
      page.getByRole("heading", { name: "トラブル" }),
    ).toBeVisible();

    // 発生場所・詳細が空のまま送信 → エラートースト。
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect(toast(page, "データが入力されていません")).toBeVisible();

    // 2 つのテキスト入力（発生場所・詳細）を埋めて送信 → 成功トースト。
    await page.getByLabel("発生場所").fill("案内所 講義棟");
    await page.getByLabel("詳細").fill("〇〇の物品がない");
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect(toast(page, "レスキューを送信しました")).toBeVisible();
  });

  test("質問: 未入力で送信するとエラー、質問入力で成功", async ({ page }) => {
    await gotoSelectType(page);

    // 種類選択で質問を選ぶ。
    await page.getByRole("button", { name: "質問" }).click();
    await expect(page.getByRole("heading", { name: "質問" })).toBeVisible();

    // 質問が空のまま送信 → エラートースト。
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect(toast(page, "質問内容が入力されていません")).toBeVisible();

    // 質問を埋めて送信 → 成功トースト。
    await page.getByLabel("質問").fill("〇〇のタスクの〇〇が分からないです");
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect(toast(page, "レスキューを送信しました")).toBeVisible();
  });

  test("人が来ない: 人数・場所を埋めてもタスク未選択(id 0)なら拒否", async ({
    page,
  }) => {
    await gotoSelectType(page);

    // 種類選択で人が来ないを選ぶ。
    await page.getByRole("button", { name: "人が来ない" }).click();
    await expect(
      page.getByRole("heading", { name: "人が来ない" }),
    ).toBeVisible();

    // 人数・場所を埋める（タスクは既定の id 0「タスクを選択してください」のまま）。
    await page.getByLabel("人数").fill("2");
    await page.getByLabel("送り先の場所").fill("案内所 講義棟");

    // 送信 → 人数・場所は揃っているので taskid 0 が弾かれるトースト。
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect(toast(page, "タスクを選択してください")).toBeVisible();
  });

  test("人が来ない: 完全に未入力なら『データが入力されていません』", async ({
    page,
  }) => {
    await gotoSelectType(page);

    await page.getByRole("button", { name: "人が来ない" }).click();
    await expect(
      page.getByRole("heading", { name: "人が来ない" }),
    ).toBeVisible();

    // 人数・場所が空のまま送信 → タスク判定より手前のデータ未入力エラー。
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect(toast(page, "データが入力されていません")).toBeVisible();
  });
});

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

// マニュアル一覧画面（/manuals）の E2E。Flutter 版 `manual_list_page.dart` の挙動
// （タスク名のリスト、タップで外部マニュアル URL を開く）を、移植先
// src/app/(main)/manuals/page.tsx に対してブラウザ越しに検証する。
//
// 前提:
// - 認証は userID=1 / roleID=1 を localStorage に注入して (main) のガードを通す。
// - ページは config.apiBaseUrl（既定 http://localhost:1234）の GET /tasks を叩く
//   （src/lib/api/tasks.ts: getManuals → apiGetList("/tasks", ...)）。これを
//   page.route でホスト非依存のパス glob により固定の snake_case ペイロードへ差し替える。
// - レスポンスは Go API と同じ snake_case。ManualSchema は task / url のみ宣言し
//   余剰キーを strip するため、最小フィールド {task, url} を返せば足りる。
// - 各 <li> は <a href={url} target="_blank" rel="noopener noreferrer"> でタスク名を表示。
//   target=_blank の遷移はテスト環境を汚さないよう、別タブ（popup）として開く。
// - 空応答（[] または null）の場合は「マニュアルがありません」を表示する
//   （apiGetList が null を [] に正規化し、page.tsx が length===0 で空文言を出す）。

// page.tsx が叩く GET /tasks。ホスト（localhost:1234 など）に依存しないよう
// パス末尾だけを glob で拾う。
const MANUALS_ENDPOINT_GLOB = "**/tasks*";

// マニュアル 3 件のシード相当。実 API は多数フィールドを持つが、UI が使うのは
// task（リスト表示テキスト）と url（外部リンク先）のみ。snake_case で返す。
const SEED_MANUALS = [
  { task: "受付マニュアル", url: "https://example.com/manuals/reception" },
  { task: "誘導マニュアル", url: "https://example.com/manuals/guide" },
  { task: "物品管理マニュアル", url: "https://example.com/manuals/inventory" },
];

// マニュアル項目リンクのロケータ。ボトムナビ（/shifts /manuals /rescue /etc の
// 4 つの <a>）も role=link で拾われてしまうため、page.tsx が付与する
// target="_blank"（ナビには無い）でマニュアル一覧の <a> だけに限定する。
function manualLinks(page: Page) {
  return page.locator('a[target="_blank"]');
}

// GET /tasks を任意のボディで差し替える共通ヘルパー。認証注入も併せて行う。
// addInitScript / route はいずれも goto より前に仕込むこと。
async function setupManualsPage(page: Page, body: unknown): Promise<void> {
  await page.route(MANUALS_ENDPOINT_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  // userID=1 / roleID=1 を注入して (main) の認証ガードを通す。
  await injectAuth(page, { userID: "1", roleID: "1" });
}

test.describe("マニュアル一覧", () => {
  test("3 件のマニュアルがタスク名で描画される", async ({ page }) => {
    await setupManualsPage(page, SEED_MANUALS);
    await page.goto("/manuals");

    // 3 件すべてのタスク名が表示されること。
    for (const { task } of SEED_MANUALS) {
      await expect(page.getByText(task, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    }

    // マニュアル項目リンク（<li><a target="_blank">）がちょうど 3 個であること。
    await expect(manualLinks(page)).toHaveCount(SEED_MANUALS.length);
  });

  test("各項目は href=その url・target=_blank・rel に noopener を含む <a> である", async ({
    page,
  }) => {
    await setupManualsPage(page, SEED_MANUALS);
    await page.goto("/manuals");

    for (const { task, url } of SEED_MANUALS) {
      // タスク名のリンクをロールで特定する。
      const link = page.getByRole("link", { name: task, exact: true });
      await expect(link).toBeVisible({ timeout: 15_000 });
      await expect(link).toHaveAttribute("href", url);
      await expect(link).toHaveAttribute("target", "_blank");
      // rel は "noopener noreferrer"。noopener を含むことを検証する。
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
  });

  test("項目をクリックすると外部 URL が別タブで開く", async ({
    page,
    context,
  }) => {
    await setupManualsPage(page, SEED_MANUALS);
    await page.goto("/manuals");

    const target = SEED_MANUALS[0];
    const link = page.getByRole("link", { name: target.task, exact: true });
    await expect(link).toBeVisible({ timeout: 15_000 });

    // target=_blank なのでクリックは新規 page（popup）を生む。その URL を検証する。
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      link.click(),
    ]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {
      // 外部ドメインへの実遷移は環境により失敗しうるが、URL は即時に確定する。
    });
    expect(popup.url()).toBe(target.url);
  });

  test("マニュアルが 0 件のとき空文言を表示する", async ({ page }) => {
    // 一部の Go エンドポイントは空のとき null を返す。apiGetList が [] に正規化し、
    // page.tsx は length===0 で空文言を出す。null でも [] でも同じ分岐を通る。
    await setupManualsPage(page, []);
    await page.goto("/manuals");

    await expect(page.getByText("マニュアルがありません")).toBeVisible({
      timeout: 15_000,
    });
    // 空状態ではマニュアル項目リンクは 1 つも描画されない（ボトムナビは別物）。
    await expect(manualLinks(page)).toHaveCount(0);
  });
});

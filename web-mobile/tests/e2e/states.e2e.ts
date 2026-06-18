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
async function setLocalStorageItem(
  page: Page,
  key: string,
  value: string,
): Promise<void> {
  await page.addInitScript(([k, v]: [string, string]) => {
    window.localStorage.setItem(k, v);
  }, [key, value] as [string, string]);
}

// ローディング／エラー／空 の三状態を、シフト画面（/shifts）とマニュアル画面
// （/manuals）でブラウザ越しに検証する E2E。アサーション文字列は対象コンポーネント
// （src/app/(main)/shifts/page.tsx・src/app/(main)/manuals/page.tsx の StatusMessage /
// MdWarning ブロック）の文言をそのまま転記する。
//
// 前提・設計:
// - 認証は userID=1 / roleID=1 を localStorage に注入し、goto より前に仕込んで
//   (main) のガードを通す（addInitScript / route はいずれも goto 前）。
// - バックエンドには依存せず、各状態を page.route の固定レスポンスで再現する。
//   ホスト（localhost:1234 等）非依存にするためパス末尾だけを glob で拾う。
// - 各テストは Playwright のデフォルト分離で fresh context（空の IndexedDB
//   ＝永続キャッシュ無し）で走る。よって初回ロードは isPending=true となり
//   ローディング文言が観測できる。
// - QueryClient は retry: 1（providers.tsx）。エラー状態は 1 回リトライしてから
//   確定するため、エラー文言のアサーションには余裕のあるタイムアウトを与える。

// /shifts の WEATHER_ID=1・既定タブ dayID=1 に対応するエンドポイント。
const SHIFT_ENDPOINT_GLOB = "**/shift-cards/users/1/dates/1/weathers/1*";
// /manuals は getManuals() → GET /tasks（client.ts の toUrl で apiBaseUrl + "/tasks"）。
// /tasks/users/:id（レスキューのタスク取得）と衝突しないよう、末尾完全一致の glob を使う。
const MANUALS_ENDPOINT_GLOB = "**/tasks";

// /shifts 共通の下ごしらえ。認証を注入し、固定オーバーレイのレビューシートを
// 抑止する（空・ローディング・エラーでは原則出ないが、念のため対象タスクを
// レビュー済みにしておく。reviewed-store.ts は JSON 文字列の配列を読む）。
async function setupShiftsAuth(page: Page): Promise<void> {
  await injectAuth(page, { userID: "1", roleID: "1" });
  await setLocalStorageItem(
    page,
    "reviewed_tasks",
    JSON.stringify(["テスト1", "テスト2"]),
  );
}

test.describe("状態表示: マイシフト（/shifts）", () => {
  test("ローディング: フェッチ遅延中は『読み込み中...』が表示される", async ({
    page,
  }) => {
    await setupShiftsAuth(page);

    // レスポンスを意図的に遅延させ、isPending=true のローディング表示を観測する。
    await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto("/shifts");

    // 遅延が解ける前にローディング文言が出ること（page.tsx の isPending 分岐＝
    // StatusMessage の <div>）。RefreshButton も isFetching 中は同じ「読み込み中...」
    // を <button> に出すため、StatusMessage の div に限定して掴む（.and(div)）。
    await expect(
      page
        .getByText("読み込み中...", { exact: true })
        .and(page.locator("div")),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("エラー: 500 応答で『シフトの取得に失敗しました』が表示される", async ({
    page,
  }) => {
    await setupShiftsAuth(page);

    await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "internal server error" }),
      });
    });

    await page.goto("/shifts");

    // retry: 1 のリトライ完了後に isError 分岐へ。タイムアウトは長めに取る。
    await expect(
      page.getByText("シフトの取得に失敗しました", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("空: 空配列応答で『データがありません』が表示される", async ({
    page,
  }) => {
    await setupShiftsAuth(page);

    await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.goto("/shifts");

    // cards.length === 0 分岐（MdWarning ＋『データがありません』）。
    await expect(
      page.getByText("データがありません", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("状態表示: マニュアル（/manuals）", () => {
  test("空: 空配列応答で『マニュアルがありません』が表示される", async ({
    page,
  }) => {
    await injectAuth(page, { userID: "1", roleID: "1" });

    await page.route(MANUALS_ENDPOINT_GLOB, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.goto("/manuals");

    // data.length === 0 分岐（manuals/page.tsx）。
    await expect(
      page.getByText("マニュアルがありません", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("エラー: 500 応答で『マニュアルの取得に失敗しました』が表示される", async ({
    page,
  }) => {
    await injectAuth(page, { userID: "1", roleID: "1" });

    await page.route(MANUALS_ENDPOINT_GLOB, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "internal server error" }),
      });
    });

    await page.goto("/manuals");

    // retry: 1 のリトライ完了後に isError 分岐へ。タイムアウトは長めに取る。
    await expect(
      page.getByText("マニュアルの取得に失敗しました", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

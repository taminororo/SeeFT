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

// マイシフト画面（/shifts）の日付タブ切り替え E2E。Flutter 版 my_shift_page.dart の
// _handleTabChange（_tabController.index + 1 を dayID として再ロード）をオラクルに、
// 準備日=dayID1 / 1日目=dayID2 / 2日目=dayID3 のタブが、それぞれ対応する
// /shift-cards/users/1/dates/{dayID}/weathers/1 を叩いて、その日のカードを描画する
// ことを検証する。page.tsx の WEATHER_ID=1 固定・DAYS（id 1/2/3, ラベル 準備日/1日目/2日目）
// と、TanStack Query の queryKey=["shiftCards", userID, selectedDayID, WEATHER_ID] に対応。
//
// Playwright のデフォルト分離により各テストは fresh context（空の localStorage /
// IndexedDB）で走る。そのため毎テストで認証注入とレビュー抑止を addInitScript で
// 仕込み直す必要がある。バックエンドには依存せず、3 つのエンドポイントを page.route で
// それぞれ別カードの snake_case ペイロードに差し替える。

// 各日のシード（タスク名で日を判別できるよう、それぞれ別の task_name を与える）。
// レスポンスは Go API と同じ snake_case（src/lib/api/shifts.ts の ShiftCardSchema が
// camelCase へ変換する）。
function seedFor(taskName: string, place: string) {
  return [
    {
      task_name: taskName,
      start_time: "8:00",
      end_time: "9:00",
      place,
      url: "",
      shift_members: [],
      before_members: null,
      after_members: null,
    },
  ];
}

const TASK_DAY1 = "準備タスク";
const TASK_DAY2 = "1日目タスク";
const TASK_DAY3 = "2日目タスク";

const PLACE_DAY1 = "準備集合場所";
const PLACE_DAY2 = "1日目集合場所";
const PLACE_DAY3 = "2日目集合場所";

// page.tsx の DAYS と WEATHER_ID=1 に対応する 3 つのエンドポイント。
// ホスト（localhost:1234 など）に依存しないようパス末尾だけを glob で拾う。
const ENDPOINT_DAY1 = "**/shift-cards/users/1/dates/1/weathers/1*";
const ENDPOINT_DAY2 = "**/shift-cards/users/1/dates/2/weathers/1*";
const ENDPOINT_DAY3 = "**/shift-cards/users/1/dates/3/weathers/1*";

// 各テスト共通の下ごしらえ: 3 日分のシフト API をそれぞれ別カードで固定し、
// 認証とレビュー抑止を注入する。addInitScript / route はいずれも goto より前に仕込むこと。
async function setupDayTabsPage(page: Page): Promise<void> {
  await page.route(ENDPOINT_DAY1, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seedFor(TASK_DAY1, PLACE_DAY1)),
    });
  });
  await page.route(ENDPOINT_DAY2, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seedFor(TASK_DAY2, PLACE_DAY2)),
    });
  });
  await page.route(ENDPOINT_DAY3, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seedFor(TASK_DAY3, PLACE_DAY3)),
    });
  });

  // userID=1 / roleID=1 を注入して (main) の認証ガードを通す。
  await injectAuth(page, { userID: "1", roleID: "1" });

  // 固定オーバーレイのレビューシートはカードクリックを遮るため、全日分の対象タスクを
  // レビュー済みにして抑止する（reviewed-store.ts は JSON 文字列の配列を読む）。
  await setLocalStorageItem(
    page,
    "reviewed_tasks",
    JSON.stringify([TASK_DAY1, TASK_DAY2, TASK_DAY3]),
  );
}

// 指定ラベルの日付タブボタン（準備日 / 1日目 / 2日目）。
function dayTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

test.describe("マイシフト 日付タブ切り替え", () => {
  test("既定タブ 準備日 は dates/1 のカードを表示し、アクティブ装飾が付く", async ({
    page,
  }) => {
    await setupDayTabsPage(page);
    await page.goto("/shifts");

    // 既定 dayID=1 → dates/1 の 準備タスク が描画される。
    await expect(page.getByText(TASK_DAY1, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // 他日のカードは出ていない。
    await expect(page.getByText(TASK_DAY2, { exact: true })).toHaveCount(0);
    await expect(page.getByText(TASK_DAY3, { exact: true })).toHaveCount(0);

    // 準備日タブがアクティブ装飾（bg-base text-main）、他は非アクティブ（text-gray-light）。
    await expect(dayTab(page, "準備日")).toHaveClass(/bg-base/);
    await expect(dayTab(page, "準備日")).toHaveClass(/text-main/);
    await expect(dayTab(page, "1日目")).toHaveClass(/text-gray-light/);
    await expect(dayTab(page, "2日目")).toHaveClass(/text-gray-light/);
  });

  test("1日目 タブをクリックすると dates/2 を叩き、その日のカードに切り替わる", async ({
    page,
  }) => {
    await setupDayTabsPage(page);
    await page.goto("/shifts");
    await expect(page.getByText(TASK_DAY1, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // dates/2 への到達を捕捉しつつ 1日目 をクリック。
    const day2Request = page.waitForRequest(
      (req) =>
        /\/shift-cards\/users\/1\/dates\/2\/weathers\/1/.test(req.url()) &&
        req.method() === "GET",
    );
    await dayTab(page, "1日目").click();
    await day2Request;

    // 1日目タスク が描画され、準備タスク は消える。
    await expect(page.getByText(TASK_DAY2, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(TASK_DAY1, { exact: true })).toHaveCount(0);

    // アクティブ装飾が 1日目 に移る。
    await expect(dayTab(page, "1日目")).toHaveClass(/bg-base/);
    await expect(dayTab(page, "準備日")).toHaveClass(/text-gray-light/);
  });

  test("2日目 タブをクリックすると dates/3 を叩き、その日のカードに切り替わる", async ({
    page,
  }) => {
    await setupDayTabsPage(page);
    await page.goto("/shifts");
    await expect(page.getByText(TASK_DAY1, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // dates/3 への到達を捕捉しつつ 2日目 をクリック。
    const day3Request = page.waitForRequest(
      (req) =>
        /\/shift-cards\/users\/1\/dates\/3\/weathers\/1/.test(req.url()) &&
        req.method() === "GET",
    );
    await dayTab(page, "2日目").click();
    await day3Request;

    // 2日目タスク が描画され、準備タスク は消える。
    await expect(page.getByText(TASK_DAY3, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(TASK_DAY1, { exact: true })).toHaveCount(0);

    await expect(dayTab(page, "2日目")).toHaveClass(/bg-base/);
  });

  test("2日目 から 準備日 に戻ると 準備日 のカードが再表示される（キャッシュヒット可）", async ({
    page,
  }) => {
    await setupDayTabsPage(page);
    await page.goto("/shifts");
    await expect(page.getByText(TASK_DAY1, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // 一度 2日目 へ移動。
    await dayTab(page, "2日目").click();
    await expect(page.getByText(TASK_DAY3, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(TASK_DAY1, { exact: true })).toHaveCount(0);

    // 準備日 へ戻る。キャッシュ（queryKey dayID=1）から即時復元されてもよい。
    await dayTab(page, "準備日").click();
    await expect(page.getByText(TASK_DAY1, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(TASK_DAY3, { exact: true })).toHaveCount(0);

    // アクティブ装飾が 準備日 に戻る。
    await expect(dayTab(page, "準備日")).toHaveClass(/bg-base/);
  });
});

import { test, expect, type Page } from "@playwright/test";
// 認証ヘルパーをインライン化（Node 23 + Playwright 1.61 の相対 TS インポート不具合
// "context.conditions?.includes is not a function" を回避。ツールチェーン修正後は
// ./helpers/auth から import に戻せる）。shifts.e2e.ts / review.e2e.ts と同形。
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

// 展開後のシフトカード「担当者の一覧」描画の E2E。
// オラクルは shift-card.tsx の展開セクション描画:
//   - トグルは場所テキストを内包する <button aria-expanded>。
//   - 展開で 【集合場所】【マニュアル】【困った時は】【担当者の一覧】
//     【前の時間の担当者の一覧】【次の時間の担当者の一覧】を描画。
//   - メンバーは formatGroup により `(${bureau}${grade}) ${name}` を ", " 連結し、
//     先頭に `sTime〜eTime` ヘッダ行を持つ（whitespace-pre-line の <p> 内）。
//
// バックエンドには依存しない。ページは config.apiBaseUrl の
// GET /shift-cards/users/1/dates/1/weathers/1 を叩くので、これを page.route で
// 固定の snake_case ペイロード（shifts.ts の ShiftCardSchema が camelCase へ変換）に
// 差し替えて決定論的にする。

// page.tsx の WEATHER_ID=1・既定タブ dayID=1 に対応するエンドポイント。
// ホスト（localhost:1234 など）に依存しないようパス末尾だけを glob で拾う。
const SHIFT_ENDPOINT_GLOB = "**/shift-cards/users/1/dates/1/weathers/1*";

// 検証対象タスク。場所テキストでトグルを特定する（shift-card.tsx のトグル仕様）。
const TASK_1 = "テスト1";
const PLACE_1 = "体育館";

// formatGroup が生成する期待文字列（ヘッダ行は別行、メンバーは ", " 連結）。
// whitespace-pre-line の <p> 内に出るため、テストは substring マッチで照合する。
const MEMBER_ROOT = "(執行部B1) root";
const MEMBER_TEST = "(執行部B1) test";
const BEFORE_MEMBER = "(企画B2) 花子";
const AFTER_MEMBER = "(渉外B3) 太郎";

// メンバーありの基本ペイロード（仕様 1・2 用）。
const CARD_WITH_MEMBERS = {
  task_name: TASK_1,
  start_time: "8:00",
  end_time: "9:00",
  place: PLACE_1,
  url: "",
  shift_members: [
    {
      s_time: "8:00",
      e_time: "9:00",
      members: [
        { name: "root", grade: "B1", bureau: "執行部" },
        { name: "test", grade: "B1", bureau: "執行部" },
      ],
    },
  ],
  before_members: {
    s_time: "7:00",
    e_time: "8:00",
    members: [{ name: "花子", grade: "B2", bureau: "企画" }],
  },
  after_members: {
    s_time: "9:00",
    e_time: "10:00",
    members: [{ name: "太郎", grade: "B3", bureau: "渉外" }],
  },
};

// メンバー空配列のペイロード（仕様 3 用）。before/after も空にしてフォールバックを通す。
const CARD_EMPTY_MEMBERS = {
  task_name: TASK_1,
  start_time: "8:00",
  end_time: "9:00",
  place: PLACE_1,
  url: "",
  shift_members: [
    {
      s_time: "8:00",
      e_time: "9:00",
      members: [],
    },
  ],
  before_members: { s_time: "", e_time: "", members: [] },
  after_members: { s_time: "", e_time: "", members: [] },
};

// シフト API を指定ペイロードで固定し、認証とレビュー抑止を注入する共通の下ごしらえ。
// addInitScript / route はいずれも goto より前に仕込むこと。
async function setupShiftsPage(
  page: Page,
  payload: Array<Record<string, unknown>>,
): Promise<void> {
  await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  // userID=1 / roleID=1 を注入して (main) の認証ガードを通す。
  await injectAuth(page, { userID: "1", roleID: "1" });

  // 固定オーバーレイのレビューシートはカードクリックを遮るため、対象タスクを
  // レビュー済みにして抑止する（reviewed-store.ts は JSON 文字列の配列を読む）。
  await setLocalStorageItem(page, "reviewed_tasks", JSON.stringify([TASK_1]));
}

// カード描画まで待つ共通ヘルパー（TanStack Query のフェッチ完了待ち）。
async function gotoShiftsAndWaitForCards(page: Page): Promise<void> {
  await page.goto("/shifts");
  await expect(page.getByText(TASK_1, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

// テスト1 カードの「集合場所」展開トグル（場所テキスト PLACE_1 を内包する button）。
function placeToggleForTask1(page: Page) {
  return page.getByRole("button").filter({ hasText: PLACE_1 });
}

// 指定見出しを持つ展開セクション（<div> 内に <p>title</p> ＋ 行群）。
// whitespace-pre-line のメンバー文字列を substring で照合するため、セクション単位で絞る。
function sectionByTitle(page: Page, title: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(title, { exact: true }) })
    .last();
}

test.describe("展開シフトカードの担当者一覧描画", () => {
  test("展開すると【担当者の一覧】に各メンバーが formatGroup 形式で出る", async ({
    page,
  }) => {
    await setupShiftsPage(page, [CARD_WITH_MEMBERS]);
    await gotoShiftsAndWaitForCards(page);

    // 展開前は担当者一覧の見出しは存在しない。
    await expect(page.getByText("【担当者の一覧】", { exact: true })).toHaveCount(
      0,
    );

    // テスト1 の集合場所トグルを開く。
    await placeToggleForTask1(page).click();

    // 【担当者の一覧】セクションが現れ、両メンバーが含まれること。
    const memberSection = sectionByTitle(page, "【担当者の一覧】");
    await expect(memberSection).toBeVisible();
    // whitespace-pre-line ブロック内の substring マッチ。
    await expect(memberSection.getByText(MEMBER_ROOT)).toBeVisible();
    await expect(memberSection.getByText(MEMBER_TEST)).toBeVisible();
  });

  test("【前の時間の担当者の一覧】【次の時間の担当者の一覧】に before/after メンバーが出る", async ({
    page,
  }) => {
    await setupShiftsPage(page, [CARD_WITH_MEMBERS]);
    await gotoShiftsAndWaitForCards(page);

    await placeToggleForTask1(page).click();

    // 前の時間: 花子（企画B2）。
    const beforeSection = sectionByTitle(page, "【前の時間の担当者の一覧】");
    await expect(beforeSection).toBeVisible();
    await expect(beforeSection.getByText(BEFORE_MEMBER)).toBeVisible();

    // 次の時間: 太郎（渉外B3）。
    const afterSection = sectionByTitle(page, "【次の時間の担当者の一覧】");
    await expect(afterSection).toBeVisible();
    await expect(afterSection.getByText(AFTER_MEMBER)).toBeVisible();
  });

  test("メンバーが空でも【担当者の一覧】の見出しは描画され、クラッシュしない", async ({
    page,
  }) => {
    await setupShiftsPage(page, [CARD_EMPTY_MEMBERS]);
    await gotoShiftsAndWaitForCards(page);

    await placeToggleForTask1(page).click();

    // セクション見出し自体は出る（formatGroup でヘッダ行のみ、メンバー行は空）。
    await expect(
      page.getByText("【担当者の一覧】", { exact: true }),
    ).toBeVisible();

    // before/after は空配列なのでフォールバック文言が出る（shift-card.tsx の三項）。
    await expect(
      page.getByText("前の時間の担当者はいません", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("次の時間の担当者はいません", { exact: true }),
    ).toBeVisible();
  });
});

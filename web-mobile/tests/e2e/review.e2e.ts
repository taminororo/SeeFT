import { expect, test, type Page } from "@playwright/test";
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

// reviewed_tasks を「マージ注入」する。addInitScript は reload 毎に再実行されるため、
// 単純 set だとアプリの markReviewed（送信時の書き込み）を上書きしてしまう。
// 既存値に名前を足す形にすることで、送信→reload 後も markReviewed が生き残る。
async function seedReviewed(page: Page, names: string[]): Promise<void> {
  await page.addInitScript((seedNames: string[]) => {
    let cur: unknown = [];
    try {
      const raw = window.localStorage.getItem("reviewed_tasks");
      if (raw) cur = JSON.parse(raw);
    } catch {
      cur = [];
    }
    const base = Array.isArray(cur) ? (cur as string[]) : [];
    const merged = Array.from(new Set([...base, ...seedNames]));
    window.localStorage.setItem("reviewed_tasks", JSON.stringify(merged));
  }, names);
}

// レビューシートの E2E。Flutter 版 `my_shift_page.dart` の `_showReviewFormIfNeeded`
// ＋ `review_bottom_sheet.dart`（ReviewBottomSheet / ReviewForm）の移植挙動を検証する。
//
// 表示条件（src/app/(main)/shifts/page.tsx の pendingReviews）:
//   - 選択中の日付（準備日 = dayID 1）のシフトカードのうち、
//   - reviewed_tasks（localStorage）に無く、かつ
//   - end_time が dataUpdatedAt（フェッチ時刻）より過去のもの
// が対象になり、最初の 1 件がシート（`シフトのレビュー: {taskName}`）として出る。
//
// NUTFES_* の日付は既定で 2025-09（過去）なので、準備日の終了済みシフトは
// 現在（フェッチ時刻）から見て必ず「終了済み」となり、レビュー対象になる。
//
// 前提: テスト用バックエンド（NEXT_PUBLIC_API_BASE_URL）が userID=1 / dayID=1 /
// weatherID=1 に対し、タスク名 "テスト1" / "テスト2" を含む終了済みシフトカードを
// 返すこと。送信は実際に /reviews へ POST され（201）、テスト DB に行が作られる
// （タスク要件どおり許容）。

const REVIEW_SHEET_TITLE = "シフトのレビュー";
const TASK_1 = "テスト1";
const TASK_2 = "テスト2";

// シフトカードのフェッチ完了を待つ目安。実バックエンド＋React Query のため余裕を持たせる。
const NETWORK_SETTLE_MS = 4_000;

/** 指定タスク名のレビューシート見出しのロケータ。 */
function reviewHeadingFor(page: Page, taskName: string) {
  return page.getByText(`${REVIEW_SHEET_TITLE}: ${taskName}`, { exact: true });
}

test.describe("シフトのレビューシート", () => {
  test("テスト1 のみ未レビュー: 準備日でレビューシートが表示される", async ({
    page,
  }) => {
    // 認証（userID=1 / roleID=1）を注入してガードを通す。
    await injectAuth(page, { userID: "1", roleID: "1" });
    // テスト2 を事前レビュー済みにして、未レビューを テスト1 だけに絞る。
    await seedReviewed(page, [TASK_2]);

    // 準備日（dayID=1）が初期選択。/shifts へ遷移。
    await page.goto("/shifts");

    // フェッチ後にレビューシートが（テスト1 で）出るのを待つ。
    const heading = reviewHeadingFor(page, TASK_1);
    await expect(heading).toBeVisible({ timeout: NETWORK_SETTLE_MS + 6_000 });

    // タイトル文言とタスク名の両方を確認。
    await expect(heading).toContainText(REVIEW_SHEET_TITLE);
    await expect(heading).toContainText(TASK_1);

    // 事前レビュー済みの テスト2 のシートは出ていないこと。
    await expect(reviewHeadingFor(page, TASK_2)).toHaveCount(0);
  });

  test("送信するとシートが閉じ、リロードしても再表示されない", async ({
    page,
  }) => {
    await injectAuth(page, { userID: "1", roleID: "1" });
    // テスト2 を事前レビュー済みにして、テスト1 だけを未レビューにする。
    await seedReviewed(page, [TASK_2]);

    await page.goto("/shifts");

    const heading = reviewHeadingFor(page, TASK_1);
    await expect(heading).toBeVisible({ timeout: NETWORK_SETTLE_MS + 6_000 });

    // /reviews への POST（201）が飛ぶことを確認しつつ送信ボタンを押す。
    // postReview 成功 → markReviewed(テスト1) → onClose で閉じる。
    const submitButton = page.getByRole("button", { name: "送信" });
    await expect(submitButton).toBeEnabled();

    const [reviewResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/reviews") && res.request().method() === "POST",
        { timeout: NETWORK_SETTLE_MS + 6_000 },
      ),
      submitButton.click(),
    ]);
    expect(reviewResponse.status()).toBe(201);

    // 送信成功でシートが閉じる（テスト1 の見出しが消える）。
    await expect(heading).toBeHidden({ timeout: NETWORK_SETTLE_MS + 6_000 });

    // markReviewed が localStorage に永続化されていること。
    const reviewed = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("reviewed_tasks") ?? "[]"),
    );
    expect(reviewed).toContain(TASK_1);
    expect(reviewed).toContain(TASK_2);

    // リロード。テスト1 は永続化済み、テスト2 は事前レビュー済みなので、
    // どちらのレビューシートも再表示されない。
    await page.reload();

    // フェッチが落ち着くのを待ってから、シートが出ないことを確認する。
    await page.waitForLoadState("networkidle");
    await expect(reviewHeadingFor(page, TASK_1)).toHaveCount(0);
    await expect(page.getByText(new RegExp(REVIEW_SHEET_TITLE))).toHaveCount(0);
  });

  test("両方レビュー済みなら、準備日でレビューシートは一切出ない", async ({
    page,
  }) => {
    await injectAuth(page, { userID: "1", roleID: "1" });
    // テスト1 / テスト2 とも事前レビュー済み。
    await setLocalStorageItem(
      page,
      "reviewed_tasks",
      JSON.stringify([TASK_1, TASK_2]),
    );

    await page.goto("/shifts");

    // フェッチが落ち着くまで待ってから、いかなるレビューシートも無いことを確認。
    await page.waitForLoadState("networkidle");
    await expect(reviewHeadingFor(page, TASK_1)).toHaveCount(0);
    await expect(reviewHeadingFor(page, TASK_2)).toHaveCount(0);
    await expect(page.getByText(new RegExp(REVIEW_SHEET_TITLE))).toHaveCount(0);
  });
});

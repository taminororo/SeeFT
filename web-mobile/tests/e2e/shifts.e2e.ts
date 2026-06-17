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

// マイシフト画面（/shifts）の E2E。Flutter 版 my_shift_page.dart の New バッジ挙動を
// オラクルに、(1) 初回訪問は全カード New、(2) 開封で New 消去＋永続化、(3) 更新で
// 同一データなら再 New しない、を検証する。
//
// Playwright のデフォルト分離により各テストは fresh context（空の localStorage /
// IndexedDB ＝「初回訪問」相当）で走る。そのため毎テストで認証注入とレビュー抑止を
// addInitScript で仕込み直す必要がある。
//
// バックエンドには依存しない。ページは config.apiBaseUrl（既定 http://localhost:1234）
// の GET /shift-cards/users/1/dates/1/weathers/1 を叩くので、これを page.route で
// 固定の snake_case ペイロードに差し替える。

// 準備日（dayID 1）のシード相当: テスト1 (8:00-9:00) / テスト2 (10:00-11:00)。
// レスポンスは Go API と同じ snake_case（src/lib/api/shifts.ts の ShiftCardSchema が
// camelCase へ変換する）。place はキー検証で使うため安定した固定値を与える。
const PLACE_1 = "テスト集合場所1";
const PLACE_2 = "テスト集合場所2";

const SEED_DAY1 = [
  {
    task_name: "テスト1",
    start_time: "8:00",
    end_time: "9:00",
    place: PLACE_1,
    url: "",
    shift_members: [],
    before_members: null,
    after_members: null,
  },
  {
    task_name: "テスト2",
    start_time: "10:00",
    end_time: "11:00",
    place: PLACE_2,
    url: "",
    shift_members: [],
    before_members: null,
    after_members: null,
  },
];

// page.tsx の WEATHER_ID=1・default tab dayID=1 に対応するエンドポイント。
// ホスト（localhost:1234 など）に依存しないようパス末尾だけを glob で拾う。
const SHIFT_ENDPOINT_GLOB = "**/shift-cards/users/1/dates/1/weathers/1*";

// テスト1 カードのキー（badge-store.ts / new-badge.ts の cardKey 仕様: dayID|task|start|end|place、
// 時刻は HH:MM に正規化）。userID 1 / dayID 1。
const CARD_KEY_1 = `1|テスト1|08:00|09:00|${PLACE_1}`;

// 各テスト共通の下ごしらえ: シフト API をシードで固定し、認証とレビュー抑止を注入する。
// addInitScript / route はいずれも goto より前に仕込むこと。
async function setupShiftsPage(page: Page): Promise<void> {
  await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SEED_DAY1),
    });
  });

  // userID=1 / roleID=1 を注入して (main) の認証ガードを通す。
  await injectAuth(page, { userID: "1", roleID: "1" });

  // 固定オーバーレイのレビューシートはカードクリックを遮るため、対象タスクを
  // レビュー済みにして抑止する（reviewed-store.ts は JSON 文字列の配列を読む）。
  await setLocalStorageItem(
    page,
    "reviewed_tasks",
    JSON.stringify(["テスト1", "テスト2"]),
  );
}

// TanStack Query のフェッチ完了後にカードが出るまで待つ共通ヘルパー。
async function gotoShiftsAndWaitForCards(page: Page): Promise<void> {
  await page.goto("/shifts");
  // フェッチ＋レンダリングに余裕を持たせる。
  await expect(page.getByText("テスト1", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

// localStorage の生値を取り出す（未設定なら null）。
function readLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

// テスト1 カードの「集合場所」展開ボタン（onOpened を発火させるトグル）。
// shift-card.tsx では場所テキストを内包する button[aria-expanded] がトグル。
function placeToggleForTask1(page: Page) {
  // テスト1 のカード（場所テキスト PLACE_1 を持つトグル）を場所名で特定する。
  return page.getByRole("button").filter({ hasText: PLACE_1 });
}

test.describe("マイシフト New バッジ挙動", () => {
  test("初回訪問では両カードに new!! バッジが付き、new_keys / baseline が永続化される", async ({
    page,
  }) => {
    await setupShiftsPage(page);
    await gotoShiftsAndWaitForCards(page);

    // テスト2 も描画されていること。
    await expect(page.getByText("テスト2", { exact: true })).toBeVisible();

    // 初回ロードは baseline=null ＝ 全カード New。new!! が 2 個出る。
    await expect(page.getByText("new!!", { exact: true })).toHaveCount(2);

    // 永続化キー（badge-store.ts）が非空であること。
    const newKeys = await readLocalStorage(page, "new_keys_1_1");
    const baseline = await readLocalStorage(page, "shift_baseline_1_1");

    expect(newKeys).not.toBeNull();
    expect(baseline).not.toBeNull();
    // 空配列 "[]" ではなく、実キーを含むこと。
    expect(JSON.parse(newKeys as string)).toHaveLength(2);
    expect(JSON.parse(baseline as string)).toHaveLength(2);
    expect(JSON.parse(newKeys as string)).toContain(CARD_KEY_1);
    expect(JSON.parse(baseline as string)).toContain(CARD_KEY_1);
  });

  test("カードを開くと new!! が消え、reload 後も消えたまま opened_keys に残る", async ({
    page,
  }) => {
    await setupShiftsPage(page);
    await gotoShiftsAndWaitForCards(page);

    // 開く前は 2 個。
    await expect(page.getByText("new!!", { exact: true })).toHaveCount(2);

    // テスト1 の集合場所トグルを開く → onOpened 発火。
    await placeToggleForTask1(page).click();

    // テスト1 の new!! が消え、残るのはテスト2 の 1 個だけ。
    await expect(page.getByText("new!!", { exact: true })).toHaveCount(1);

    // opened_keys_1 にテスト1 のキーが入ること（markBadgeOpened の永続化）。
    await expect
      .poll(() => readLocalStorage(page, "opened_keys_1"))
      .not.toBeNull();
    const opened = JSON.parse(
      (await readLocalStorage(page, "opened_keys_1")) as string,
    );
    expect(opened).toContain(CARD_KEY_1);

    // reload しても開封状態は維持され、テスト1 は再 New しない。
    await page.reload();
    await expect(page.getByText("テスト1", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("new!!", { exact: true })).toHaveCount(1);

    // opened_keys は永続化されたまま。
    const openedAfter = JSON.parse(
      (await readLocalStorage(page, "opened_keys_1")) as string,
    );
    expect(openedAfter).toContain(CARD_KEY_1);
  });

  test("更新ボタンを押しても、同一データなら開封済みカードは再 New しない", async ({
    page,
  }) => {
    await setupShiftsPage(page);
    await gotoShiftsAndWaitForCards(page);

    // テスト1 を開いて開封済みにする。
    await placeToggleForTask1(page).click();
    await expect(page.getByText("new!!", { exact: true })).toHaveCount(1);

    // 更新（同一データを返す route のまま）。
    await page.getByRole("button", { name: "更新" }).click();

    // フェッチ完了を待つ（読み込み中... → 更新 に戻る）。
    await expect(page.getByRole("button", { name: "更新" })).toBeEnabled({
      timeout: 15_000,
    });
    await expect(page.getByText("テスト1", { exact: true })).toBeVisible();

    // 同一データなので detectNewKeys は空、開封済みのテスト1 が再 New することはない。
    // 残る new!! はテスト2 の 1 個のまま。
    await expect(page.getByText("new!!", { exact: true })).toHaveCount(1);

    // 念のためテスト1 カード内に new!! が無いことも確認する。
    const task1Card = page
      .locator("div")
      .filter({ has: page.getByText("テスト1", { exact: true }) })
      .filter({ has: page.getByText(PLACE_1) })
      .last();
    await expect(task1Card.getByText("new!!", { exact: true })).toHaveCount(0);
  });
});

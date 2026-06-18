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

// 本部からの返答タブ（/rescue の「本部からの返答」サブタブ）の E2E。
// Flutter 版 `rescue_response_tab/rescue_response_tab.dart` をオラクルに、
// src/components/rescue/rescue-response.tsx の表示挙動を検証する。
//
// 検証対象:
// (1) type 別タイトル（【トラブル】… 【質問】… 【人が来ない】…（N人））の描画。
// (2) ステータスバッジ文言 対応済 / 対応中 / 未対応。
// (3) 返答テキスト「本部からの返答: X」と空時「本部からの返答はまだありません。」。
// (4) my ↔ all 切替で正しいエンドポイントを叩く（my: /rescues/users/1、all: /rescues）。
// (5) 空配列 → 空状態メッセージ。
//
// 認証は userID=1 / roleID=1 を注入して (main) のガードを通す。
// レスポンスは Go API と同じ snake_case（src/lib/api/rescues.ts の Zod スキーマが
// camelCase へ変換する）。response は null / "" のいずれも空状態に正規化される。
//
// ルートのマッチ順について: 「my」は GET /rescues/users/1、「all」は GET /rescues。
// パス末尾 glob `**/rescues` は `**/rescues/users/1` も部分一致しうるため、
// Playwright が後勝ち（後から登録したハンドラが優先）である性質を利用し、
// 広い `**/rescues` を先に、具体的な `**/rescues/users/1*` を後に登録して
// 「my」URL では必ず specific 側が当たるようにする。

// my（自分が送信したレスキュー）用のペイロード。3 種別 × 3 ステータスを網羅し、
// 返答あり（response 文字列）と返答なし（"" / null）の両方を含める。
const MY_RESCUES = [
  {
    type: "trouble",
    id: 11,
    user_name: "上林",
    time: "2026-06-18 10:00",
    status: "done",
    response: "現地に向かいました",
    content: { task: "案内", place: "講義棟A", detail: "物品が足りない" },
  },
  {
    type: "question",
    id: 22,
    user_name: "上林",
    time: "2026-06-18 10:05",
    status: "inProgress",
    response: "",
    content: { question: "受付の手順が分かりません" },
  },
  {
    type: "shorthanded",
    id: 33,
    user_name: "上林",
    time: "2026-06-18 10:10",
    status: "todo",
    response: null,
    content: { task: "ステージ設営", missing_number: 3, place: "屋外ステージ" },
  },
];

// all（全てのレスキュー）用のペイロード。my とは別レコードにして、
// 切替時に表示集合が変化することを観測できるようにする。
const ALL_RESCUES = [
  {
    type: "trouble",
    id: 101,
    user_name: "別の人",
    time: "2026-06-18 11:00",
    status: "inProgress",
    response: "確認中です",
    content: { task: "警備", place: "正門", detail: "通行止めの件" },
  },
  {
    type: "shorthanded",
    id: 102,
    user_name: "別の人",
    time: "2026-06-18 11:05",
    status: "done",
    response: "応援を送りました",
    content: { task: "ごみ回収", missing_number: 2, place: "中庭" },
  },
];

// my エンドポイント。userID=1。response は null/"" を含むため apiGetList が
// 空配列フォールバック等を経て camelCase へ変換する。
const MY_GLOB = "**/rescues/users/1*";
// all エンドポイント。
const ALL_GLOB = "**/rescues";

// 認証注入 → ルートモック（all を先、my を後＝後勝ちで my を優先）→ goto。
// emptyMy / emptyAll で空配列を返させて空状態を検証できるようにする。
async function setupResponseTab(
  page: Page,
  options: { emptyMy?: boolean; emptyAll?: boolean } = {},
): Promise<void> {
  await injectAuth(page, { userID: "1", roleID: "1" });

  // all（広い glob）を先に登録。
  await page.route(ALL_GLOB, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.emptyAll ? [] : ALL_RESCUES),
    });
  });

  // my（具体的 glob）を後に登録 → /rescues/users/1 では my 側が当たる。
  await page.route(MY_GLOB, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.emptyMy ? [] : MY_RESCUES),
    });
  });

  await page.goto("/rescue");
  // 既定は「レスキュー送信」タブ。「本部からの返答」サブタブへ切り替える。
  await page.getByRole("button", { name: "本部からの返答" }).click();
}

// フィルタ select。表示範囲ドロップダウン。
function filterSelect(page: Page) {
  return page.locator("select");
}

test.describe("本部からの返答タブ", () => {
  test("type 別タイトルが種別ごとに描画される", async ({ page }) => {
    await setupResponseTab(page);

    // 既定 filter=my で MY_RESCUES が表示される。3 種別のタイトルを検証。
    await expect(
      page.getByText("【トラブル】物品が足りない", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("【質問】受付の手順が分かりません", { exact: true }),
    ).toBeVisible();
    // shorthanded は「【人が来ない】<task>（<N>人）」形式。missing_number=3。
    await expect(
      page.getByText("【人が来ない】ステージ設営（3人）", { exact: true }),
    ).toBeVisible();
  });

  test("ステータスバッジ 対応済 / 対応中 / 未対応 が出る", async ({ page }) => {
    await setupResponseTab(page);

    // done=対応済 / inProgress=対応中 / todo=未対応。MY は各 1 件ずつ。
    await expect(page.getByText("対応済", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("対応中", { exact: true })).toBeVisible();
    await expect(page.getByText("未対応", { exact: true })).toBeVisible();
  });

  test("返答テキストは有無で文言が切り替わる", async ({ page }) => {
    await setupResponseTab(page);

    // response="現地に向かいました"（trouble, done）→ 「本部からの返答: …」。
    await expect(
      page.getByText("本部からの返答: 現地に向かいました", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // response=""（question）と response=null（shorthanded）はいずれも空状態文言へ
    // 正規化される。2 件あるはず。
    await expect(
      page.getByText("本部からの返答はまだありません。", { exact: true }),
    ).toHaveCount(2);
  });

  test("my ↔ all 切替で正しいエンドポイントを叩き表示集合が変わる", async ({
    page,
  }) => {
    await setupResponseTab(page);

    // 初期（my）: MY のトラブルが見え、ALL 固有のレコードは見えない。
    await expect(
      page.getByText("【トラブル】物品が足りない", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("【トラブル】通行止めの件", { exact: true }),
    ).toHaveCount(0);

    // all へ切替。/rescues（all）へのリクエストが飛ぶことを待ち受ける。
    // my の /rescues/users/1 を取り違えないよう、URL に users を含まないことで判定する。
    const allRequest = page.waitForRequest(
      (req) =>
        req.method() === "GET" &&
        /\/rescues(\?|$)/.test(new URL(req.url()).pathname) &&
        !req.url().includes("/users/"),
    );
    await filterSelect(page).selectOption("all");
    await allRequest;

    // ALL 固有のレコードが見え、MY 固有のレコードは消える。
    await expect(
      page.getByText("【トラブル】通行止めの件", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("【人が来ない】ごみ回収（2人）", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("【トラブル】物品が足りない", { exact: true }),
    ).toHaveCount(0);

    // my へ戻す。my は初回ロードで既に取得済みのため TanStack Query の
    // キャッシュ（queryKey: ["rescues", "my", 1]）から即座に再表示され、
    // 必ずしも新規リクエストは飛ばない。したがって戻りは「描画集合の変化」で
    // 検証する（プロンプト許容: waitForRequest か rendered set の変化）。
    await filterSelect(page).selectOption("my");

    // MY 固有が戻り、ALL 固有は消える。
    await expect(
      page.getByText("【トラブル】物品が足りない", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("【トラブル】通行止めの件", { exact: true }),
    ).toHaveCount(0);
  });

  test("空配列なら空状態メッセージを表示する", async ({ page }) => {
    await setupResponseTab(page, { emptyMy: true });

    // 一覧は出ず、空状態の 2 行メッセージが出る。
    await expect(
      page.getByText("送信したレスキューはまだありません。", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        "レスキューを送信するとここに本部からの返答が表示されます。",
        { exact: true },
      ),
    ).toBeVisible();

    // レコードのタイトルは一切描画されない。
    await expect(page.getByText("【トラブル】", { exact: false })).toHaveCount(0);
  });
});

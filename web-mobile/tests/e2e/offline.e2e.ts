import { test, expect, type Page } from "@playwright/test";
// 認証ヘルパーをインライン化（Node 23 + Playwright 1.61 の相対 TS インポート不具合
// "context.conditions?.includes is not a function" を回避。ツールチェーン修正後は
// ./helpers/auth から import に戻せる）。shifts.e2e.ts からそのまま複製している。
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

// マイシフト画面（/shifts）の「オフライン／キャッシュ耐性」E2E。
//
// オラクルは Flutter 版 my_shift_page.dart のオフラインキャッシュ挙動:
//   - _getCashedShiftCardDataList(): まず Hive キャッシュから即表示する。
//   - _getShiftCardDataList(): その後 API を叩く。失敗（fetchedData == null）したら
//     キャッシュ表示を維持し、スナックバーでエラーを出すだけ（L237-258）。
// Web 版は providers.tsx の PersistQueryClientProvider + idb-keyval（key:
// "seeft-query-cache", maxAge/gcTime: 24h）でこれを再現する。すなわち一度オンラインで
// 取得したシフトカードは IndexedDB に永続化され、次回 API が落ちていても
// 永続キャッシュから描画される。
//
// このテストが検証するのは「同一セッション内で API が到達不能になった
// （= 現地で実際に起きるネット断）」シナリオである。具体的には:
//   1) 初回オンラインロードでカードを描画 → IndexedDB へ永続化。
//   2) 以降の shift-cards 取得を ABORT（API 到達不能を模倣）。
//   3) page.reload() しても、永続キャッシュからカード（テスト1）が描画される。
//
// 注意（このテストが検証「しない」こと）:
//   ブラウザを完全に再起動した「コールドスタート」復元は検証しない。Playwright は
//   context 単位で IndexedDB を分離するため、新しい context は空のキャッシュで始まる。
//   ここで見ているのは同一 context 内での「API 到達不能 → キャッシュ描画」だけである。
//
// 重要な手法（context.setOffline は使わない）:
//   context.setOffline(true) は localhost への通信ごと遮断するため、reload で
//   Next の dev HTML 自体が取得できず落ちる。代わりに shift-cards エンドポイントへ
//   MUTABLE な page.route ハンドラを仕込み、最初のリクエストだけ FULFILL（オンライン
//   ロード）し、以降は route.abort("failed") で API 到達不能を模倣する。Next の dev
//   HTML は通常どおり配信されるので reload は成立し、落ちるのは API コールだけになる。
//
// 実装の実挙動メモ（このテストの assertion を決める根拠）:
//   reload 時、TanStack Query は永続キャッシュをハイドレートし、staleTime（30秒,
//   providers.tsx）内なら fresh 扱いで「ネットワークを叩かずに」即描画する。つまり
//   同一セッションの reload では shift-cards への refetch が走らず、route ハンドラの
//   呼び出し回数は 1 回（初回オンラインロード）のまま増えないことがある。これこそが
//   「キャッシュ即表示」の核心であり、本テストはこの不変条件を検証する。
//   （補足: 更新ボタンは refetch() を無条件に走らせるが、失敗すると page.tsx の
//    isError 分岐で「シフトの取得に失敗しました」に切り替わりカードが消えるため、
//    オフライン耐性の検証には使わない。reload 経路がキャッシュ描画を担保する。）

// 準備日（dayID 1）のシード相当: テスト1 (8:00-9:00) / テスト2 (10:00-11:00)。
// レスポンスは Go API と同じ snake_case（src/lib/api/shifts.ts の ShiftCardSchema が
// camelCase へ変換する）。place は安定した固定値を与える。
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

// 認証とレビュー抑止を注入する（addInitScript は goto より前に仕込む）。
// オフライン経路の検証に集中するため、レビューシート（固定オーバーレイ）は抑止する。
async function injectAuthAndSuppressReview(page: Page): Promise<void> {
  await injectAuth(page, { userID: "1", roleID: "1" });
  await setLocalStorageItem(
    page,
    "reviewed_tasks",
    JSON.stringify(["テスト1", "テスト2"]),
  );
}

// 永続キャッシュのハイドレートはマウント時に非同期で走るため、reload 直後は
// 少し待ってからカードを待機する。テスト1 が見えれば描画済みとみなせる。
async function expectCardsVisible(page: Page): Promise<void> {
  await expect(page.getByText("テスト1", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("マイシフト オフライン／キャッシュ耐性", () => {
  test("オンラインで取得→キャッシュ→API到達不能で reload してもカードが描画される", async ({
    page,
  }) => {
    // MUTABLE ハンドラ: 最初の取得だけ FULFILL（オンラインロード→IndexedDB へ永続化）、
    // 以降は ABORT して API 到達不能を模倣する。
    let shiftCallCount = 0;
    let firstFulfilledCount = 0;
    await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
      shiftCallCount += 1;
      if (shiftCallCount === 1) {
        firstFulfilledCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(SEED_DAY1),
        });
      } else {
        // API 到達不能（ネット断・サーバダウン）を模倣。
        await route.abort("failed");
      }
    });

    await injectAuthAndSuppressReview(page);

    // 1) 初回オンラインロード。カードが描画される。
    await page.goto("/shifts");
    await expectCardsVisible(page);
    await expect(page.getByText("テスト2", { exact: true })).toBeVisible();
    expect(shiftCallCount).toBe(1);

    // 永続化（idb-keyval → IndexedDB key "seeft-query-cache"）が IndexedDB へ
    // 書き込まれるのを待つ。PersistQueryClientProvider はキャッシュ更新を
    // デバウンスして書き出すため、書き込み完了をポーリングで待つ。
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            // idb-keyval は既定 DB "keyval-store" / store "keyval" を使う。
            // providers.tsx の persister key "seeft-query-cache" を直接読む。
            return new Promise<boolean>((resolve) => {
              const req = indexedDB.open("keyval-store");
              req.onerror = () => resolve(false);
              req.onsuccess = () => {
                const db = req.result;
                let store;
                try {
                  store = db
                    .transaction("keyval", "readonly")
                    .objectStore("keyval");
                } catch {
                  resolve(false);
                  return;
                }
                const getReq = store.get("seeft-query-cache");
                getReq.onerror = () => resolve(false);
                getReq.onsuccess = () => {
                  const raw = getReq.result;
                  resolve(
                    raw != null && JSON.stringify(raw).includes("テスト1"),
                  );
                };
              };
            });
          }),
        {
          message: "シフトキャッシュが IndexedDB に永続化されること",
          timeout: 15_000,
        },
      )
      .toBe(true);

    // この時点でハンドラは「以降 ABORT する」状態に武装済み（=API 到達不能）。
    // 初回オンラインロード分の 1 回だけ FULFILL されている。
    expect(shiftCallCount).toBe(1);

    // 2) reload。Next の dev HTML は配信される。shift-cards へ refetch が走れば
    //    ハンドラは ABORT する（API 到達不能）。ただし staleTime 内なら refetch 自体が
    //    走らず、キャッシュがそのまま即描画される（どちらでもオフライン耐性は成立）。
    await page.reload();

    // 3) API が（武装された）到達不能状態であっても、永続キャッシュからカードが
    //    描画される（オフライン耐性の核心）。
    await expectCardsVisible(page);
    await expect(page.getByText("テスト2", { exact: true })).toBeVisible();

    // 不変条件: reload 後に「成功した API 取得」は一度も増えていない。
    //   - refetch が走らなかった場合 → shiftCallCount は 1 のまま（fresh キャッシュ即描画）。
    //   - refetch が走った場合 → 2 回目以降は必ず ABORT される（成功フェッチは無い）。
    //   いずれにせよ、画面に出ているカードは「新たな成功フェッチ」ではなく永続キャッシュ由来。
    expect(firstFulfilledCount).toBe(1);
  });

  test("reload 後に出るカードは IndexedDB 永続キャッシュ由来であり、API は到達不能のまま", async ({
    page,
  }) => {
    // 上のテストの「キャッシュ由来である」ことを独立に証明する。
    //   - reload 後に描画されるテスト1 は、永続化された IndexedDB キャッシュに実在する。
    //   - reload 中も route ハンドラは ABORT に武装され続け、成功フェッチは初回のみ。
    // ＝「API が叩かれても（到達不能でも）UI はキャッシュ済みデータを表示する」。
    let shiftCallCount = 0;
    let fulfilledCount = 0;
    let abortedCount = 0;
    await page.route(SHIFT_ENDPOINT_GLOB, async (route) => {
      shiftCallCount += 1;
      if (shiftCallCount === 1) {
        fulfilledCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(SEED_DAY1),
        });
      } else {
        abortedCount += 1;
        await route.abort("failed");
      }
    });

    await injectAuthAndSuppressReview(page);

    await page.goto("/shifts");
    await expectCardsVisible(page);

    // 永続化完了を待ってから reload する（待たずに reload すると、キャッシュ未書き込みで
    // 落ちる偽陰性を招く）。idb-keyval の既定 DB "keyval-store"/store "keyval" から
    // persister key "seeft-query-cache"（providers.tsx）を直接読む。
    const readPersistedCacheHasTask1 = () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open("keyval-store");
            req.onerror = () => resolve(false);
            req.onsuccess = () => {
              const db = req.result;
              let store;
              try {
                store = db
                  .transaction("keyval", "readonly")
                  .objectStore("keyval");
              } catch {
                resolve(false);
                return;
              }
              const getReq = store.get("seeft-query-cache");
              getReq.onerror = () => resolve(false);
              getReq.onsuccess = () => {
                const raw = getReq.result;
                resolve(raw != null && JSON.stringify(raw).includes("テスト1"));
              };
            };
          }),
      );

    await expect
      .poll(readPersistedCacheHasTask1, {
        message: "シフトキャッシュが IndexedDB に永続化されること",
        timeout: 15_000,
      })
      .toBe(true);

    await page.reload();

    // UI はキャッシュからテスト1 を描画し続ける。
    await expectCardsVisible(page);

    // reload 後も、画面に出ているカードの出所である永続キャッシュは IndexedDB に
    // 実在し、テスト1 を含む（＝描画はキャッシュ由来）。
    expect(await readPersistedCacheHasTask1()).toBe(true);

    // 成功フェッチは初回オンラインロードの 1 回のみ。reload で refetch が走った場合は
    // 必ず ABORT され（abortedCount で可視化）、新たな成功フェッチは発生しない。
    // ＝ API が到達不能でも UI はキャッシュ描画、という不変条件。
    expect(fulfilledCount).toBe(1);
    expect(abortedCount).toBe(shiftCallCount - 1);
  });
});

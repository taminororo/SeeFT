// Zod スキーマ境界の単体テスト（node 環境）。
// SUT: src/lib/api/{shifts,rescues,tasks,client}.ts の現行スキーマ。
// グローバル fetch を vi.stubGlobal で差し替え、エクスポートされた非同期ヘルパ
// （getShiftCards / getMyRescueResponses / getRescueTasks / getManuals）経由で
// snake_case -> camelCase の transform・null フォールバック・境界バリデーションを検証する。
//
// オラクル（移植元 Flutter 版）:
//   - mobile/lib/utils/api.dart            : get/post の契約（成功 200 / 空 null）
//   - mobile/lib/models/shift_card.dart    : null name -> 'データの取得に失敗しました'（L83/L96）, s_time/e_time/members
//   - mobile/lib/models/rescue.dart        : user_name -> userName（L100/L161/L232）, missing_number -> missingNumber（L197）

import { afterEach, describe, expect, it, vi } from "vitest";

import { getShiftCards } from "../shifts";
import { getMyRescueResponses, getRescueTasks } from "../rescues";
import { getManuals } from "../tasks";

// ---- fetch スタブ補助 -------------------------------------------------------

/** Response 風オブジェクト。client.ts は status と json() のみ参照する。 */
function jsonResponse(body: unknown, status = 200): Partial<Response> {
  return {
    status,
    json: () => Promise.resolve(body),
  };
}

/** 任意の本文/ステータスを 1 回返す fetch スタブをセットする。 */
function stubFetchOnce(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(jsonResponse(body, status) as Response)),
  );
}

afterEach(() => {
  // 各テスト後に必ず本物の fetch へ戻す。
  vi.unstubAllGlobals();
});

// ---- 1) shifts.ts: getShiftCards transform & null フォールバック ------------

describe("shifts.ts getShiftCards", () => {
  it("snake_case のシフトカードを camelCase へ変換し、メンバーグループを保持する", async () => {
    const raw = [
      {
        task_name: "受付",
        start_time: "09:00",
        end_time: "12:00",
        place: "正門",
        url: "https://example.com/manual",
        shift_members: [
          {
            s_time: "09:00",
            e_time: "12:00",
            members: [{ name: "上林", grade: "B3", bureau: "情報" }],
          },
        ],
        before_members: {
          s_time: "08:30",
          e_time: "09:00",
          members: [{ name: "前任", grade: "B4", bureau: "総務" }],
        },
        after_members: {
          s_time: "12:00",
          e_time: "12:30",
          members: [{ name: "後任", grade: "B2", bureau: "会計" }],
        },
      },
    ];
    stubFetchOnce(raw);

    const cards = await getShiftCards(1, 2, 3);

    expect(cards).toHaveLength(1);
    const c = cards[0];
    // 余剰でない camelCase キーへ変換される（snake_case キーは残らない）。
    expect(c).toMatchObject({
      taskName: "受付",
      startTime: "09:00",
      endTime: "12:00",
      place: "正門",
      url: "https://example.com/manual",
    });
    expect(c).not.toHaveProperty("task_name");
    expect(c).not.toHaveProperty("start_time");

    // shiftMembers グループも s_time/e_time -> sTime/eTime へ。
    expect(c.shiftMembers).toEqual([
      {
        sTime: "09:00",
        eTime: "12:00",
        members: [{ name: "上林", grade: "B3", bureau: "情報" }],
      },
    ]);
    expect(c.beforeMembers).toEqual({
      sTime: "08:30",
      eTime: "09:00",
      members: [{ name: "前任", grade: "B4", bureau: "総務" }],
    });
    expect(c.afterMembers).toEqual({
      sTime: "12:00",
      eTime: "12:30",
      members: [{ name: "後任", grade: "B2", bureau: "会計" }],
    });
  });

  it("null の before_members / after_members は空グループへフォールバックする", async () => {
    const raw = [
      {
        task_name: "巡回",
        start_time: "13:00",
        end_time: "15:00",
        place: "体育館",
        url: "https://example.com/x",
        shift_members: null,
        before_members: null,
        after_members: null,
      },
    ];
    stubFetchOnce(raw);

    const [c] = await getShiftCards(1, 1, 1);

    // shift_members が null -> []、before/after が null -> 空グループ。
    expect(c.shiftMembers).toEqual([]);
    expect(c.beforeMembers).toEqual({ sTime: "", eTime: "", members: [] });
    expect(c.afterMembers).toEqual({ sTime: "", eTime: "", members: [] });
  });

  it("メンバーの null フィールドは Flutter のフォールバック文言/空値になる", async () => {
    // shift_card.dart L83/L96: name 欠落時は 'データの取得に失敗しました'。
    const raw = [
      {
        task_name: "案内",
        start_time: "10:00",
        end_time: "11:00",
        place: "ロビー",
        url: "https://example.com/y",
        shift_members: [
          {
            // s_time/e_time/members すべて null。
            s_time: null,
            e_time: null,
            members: [{ name: null, grade: null, bureau: null }],
          },
        ],
      },
    ];
    stubFetchOnce(raw);

    const [c] = await getShiftCards(1, 1, 1);

    expect(c.shiftMembers[0].sTime).toBe("");
    expect(c.shiftMembers[0].eTime).toBe("");
    expect(c.shiftMembers[0].members[0]).toEqual({
      name: "データの取得に失敗しました",
      grade: "",
      bureau: "",
    });
  });
});

// ---- 2) client.ts: apiGetList の null 本文ハンドリング ----------------------

describe("client.ts apiGetList null 本文", () => {
  it("getMyRescueResponses: 本文が null でも throw せず [] を返す", async () => {
    // Go の一部 UseCase は空のとき null を返す（AGENTS.md 既知問題）。
    stubFetchOnce(null);

    await expect(getMyRescueResponses(42)).resolves.toEqual([]);
  });

  it("getRescueTasks: 本文が null でも throw せず [] を返す", async () => {
    stubFetchOnce(null);

    await expect(getRescueTasks(42)).resolves.toEqual([]);
  });

  it("getRescueTasks: task フィールドを taskName へ正規化する", async () => {
    stubFetchOnce([
      { id: 10, task: "搬入" },
      { id: 11, task: null },
    ]);

    await expect(getRescueTasks(1)).resolves.toEqual([
      { id: 10, taskName: "搬入" },
      { id: 11, taskName: "" },
    ]);
  });
});

// ---- 3) rescues.ts: discriminated union + toCamel ---------------------------

describe("rescues.ts discriminatedUnion + toCamel", () => {
  it("trouble / question / shorthanded を type ごとに camelCase へマップする", async () => {
    const raw = [
      {
        type: "trouble",
        id: 1,
        user_name: "上林",
        time: "10:00",
        status: "未対応",
        response: "",
        content: { task: "受付", place: "正門", detail: "鍵が無い" },
      },
      {
        type: "question",
        id: 2,
        user_name: "danimaru",
        time: "10:05",
        status: "対応中",
        response: "確認します",
        content: { question: "昼食はどこ？" },
      },
      {
        type: "shorthanded",
        id: 3,
        user_name: "佐藤",
        time: "10:10",
        status: "未対応",
        response: "",
        content: { task: "誘導", missing_number: 2, place: "南口" },
      },
    ];
    stubFetchOnce(raw);

    const res = await getMyRescueResponses(1);

    expect(res[0]).toEqual({
      type: "trouble",
      id: 1,
      userName: "上林", // user_name -> userName（rescue.dart L100）
      time: "10:00",
      status: "未対応",
      response: "",
      content: { task: "受付", place: "正門", detail: "鍵が無い" },
    });
    expect(res[1]).toEqual({
      type: "question",
      id: 2,
      userName: "danimaru",
      time: "10:05",
      status: "対応中",
      response: "確認します",
      content: { question: "昼食はどこ？" }, // question 型は content.question のみ
    });
    expect(res[2]).toEqual({
      type: "shorthanded",
      id: 3,
      userName: "佐藤",
      time: "10:10",
      status: "未対応",
      response: "",
      // missing_number -> missingNumber（rescue.dart L197）
      content: { task: "誘導", missingNumber: 2, place: "南口" },
    });
  });

  it("null フィールドは空文字 / missingNumber は 0 へフォールバックする", async () => {
    const raw = [
      {
        type: "shorthanded",
        id: 9,
        user_name: null,
        time: null,
        status: null,
        response: null,
        content: { task: null, missing_number: null, place: null },
      },
    ];
    stubFetchOnce(raw);

    const [r] = await getMyRescueResponses(1);

    expect(r).toEqual({
      type: "shorthanded",
      id: 9,
      userName: "",
      time: "",
      status: "",
      response: "",
      content: { task: "", missingNumber: 0, place: "" },
    });
  });

  it("未知の type 判別子は parse で throw する（境界バリデーション）", async () => {
    const raw = [
      {
        type: "unknown_kind",
        id: 99,
        user_name: "誰か",
        time: "00:00",
        status: "",
        response: "",
        content: {},
      },
    ];
    stubFetchOnce(raw);

    await expect(getMyRescueResponses(1)).rejects.toThrow();
  });
});

// ---- 4) tasks.ts: getManuals は task / url のみ保持（余剰 strip）-------------

describe("tasks.ts getManuals", () => {
  it("余剰フィールドを strip し task / url のみ残す", async () => {
    const raw = [
      {
        id: 100,
        task: "電源確認",
        url: "https://example.com/power",
        placeID: 7,
        extra: { nested: true },
        bureau_id: 3,
      },
    ];
    stubFetchOnce(raw);

    const manuals = await getManuals();

    expect(manuals).toEqual([{ task: "電源確認", url: "https://example.com/power" }]);
    expect(manuals[0]).not.toHaveProperty("id");
    expect(manuals[0]).not.toHaveProperty("placeID");
    expect(manuals[0]).not.toHaveProperty("extra");
  });

  it("空文字の task も許容する（z.string() は空文字を許す）", async () => {
    stubFetchOnce([{ task: "", url: "https://example.com/empty" }]);

    await expect(getManuals()).resolves.toEqual([
      { task: "", url: "https://example.com/empty" },
    ]);
  });
});

// ---- 5) 必須フィールド欠落は parse で throw（黙って coerce しない）-----------

describe("境界バリデーション: 必須フィールド欠落", () => {
  it("task_name 欠落のシフトカードは throw する", async () => {
    const raw = [
      {
        // task_name が無い
        start_time: "09:00",
        end_time: "12:00",
        place: "正門",
        url: "https://example.com/manual",
      },
    ];
    stubFetchOnce(raw);

    await expect(getShiftCards(1, 1, 1)).rejects.toThrow();
  });

  it("url 欠落のマニュアルは throw する", async () => {
    stubFetchOnce([{ task: "搬入" }]);

    await expect(getManuals()).rejects.toThrow();
  });
});

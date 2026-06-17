// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShiftCard } from "@/lib/api/shifts";

// badge-store.ts はモジュールレベルの singleton（cache Map / listeners Set）を持つ。
// テスト間のリークを避けるため、beforeEach で localStorage を消し vi.resetModules() し、
// 各テスト内で動的 import して新鮮なモジュール状態を得る。
//
// オラクル: mobile/lib/pages/my_shift_page.dart L355-507
//   _openedKeysStorageKey / _newKeysStorageKey / _detectNewOrUpdatedCardKeys /
//   _filterAlreadyOpened / _cleanupStaleOpenedKeys / onOpened 相当。
// 永続化キー名は Flutter Hive と同一: opened_keys_{u} / new_keys_{u}_{d} / shift_baseline_{u}_{d}。

const USER = 1;
const DAY = 2;

const OPENED_KEY = `opened_keys_${USER}`;
const NEW_KEYS_KEY = `new_keys_${USER}_${DAY}`;
const BASELINE_KEY = `shift_baseline_${USER}_${DAY}`;

// 最小 ShiftCard。バッジ判定に効くのは taskName/startTime/endTime/place のみ。
function makeCard(overrides: Partial<ShiftCard> = {}): ShiftCard {
  return {
    taskName: "task",
    startTime: "09:00",
    endTime: "10:00",
    place: "本部",
    url: "",
    shiftMembers: [],
    beforeMembers: { sTime: "", eTime: "", members: [] },
    afterMembers: { sTime: "", eTime: "", members: [] },
    ...overrides,
  };
}

// cardKey と同じ規約でテスト側からも期待キーを組める純関数。
async function loadModule() {
  return import("../badge-store");
}

// localStorage に格納された JSON 配列を取り出すヘルパ。
function readStored(key: string): string[] | null {
  const raw = window.localStorage.getItem(key);
  if (raw == null) return null;
  return JSON.parse(raw) as string[];
}

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe("badge-store: reconcileBadges 初回ロード", () => {
  // 契約1: baseline 無しの初回 reconcile → 全カードが New（Flutter L450-453 全件 New 扱い）。
  it("baseline が無い初回は全カードを New として可視化し、Hive 互換キーに永続化する", async () => {
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");

    const cardA = makeCard({ taskName: "A" });
    const cardB = makeCard({ taskName: "B" });

    mod.reconcileBadges(USER, DAY, [cardA, cardB]);

    const snap = mod.getBadgeSnapshot(USER, DAY);
    const keyA = cardKey(DAY, cardA);
    const keyB = cardKey(DAY, cardB);
    expect(snap.has(keyA)).toBe(true);
    expect(snap.has(keyB)).toBe(true);
    expect(snap.size).toBe(2);

    // Flutter Hive と同一のストレージキー名で書かれること。
    expect(window.localStorage.getItem(OPENED_KEY)).toBeNull(); // opened は変化なしなら未書き込み
    expect(readStored(NEW_KEYS_KEY)).toEqual(expect.arrayContaining([keyA, keyB]));
    expect(readStored(BASELINE_KEY)).toEqual(expect.arrayContaining([keyA, keyB]));
  });
});

describe("badge-store: reconcileBadges 再照合", () => {
  // 契約2: 同一カードで2回 reconcile → baseline == current なので 2回目の検出は空。
  it("同一カードで2回 reconcile すると2回目のスナップショットは空になる", async () => {
    const mod = await loadModule();
    const cards = [makeCard({ taskName: "A" }), makeCard({ taskName: "B" })];

    mod.reconcileBadges(USER, DAY, cards);
    // 1回目で書かれた new_keys を「既読でない既存 New」として残しつつ、baseline が更新される。
    // 2回目では detected が空。ただし existingNew は残るため、New を消すのは open のみ。
    // ここでは「新規検出が増えない」ことを検証する: 一度開封して existingNew を空にした後に再 reconcile。
    const { cardKey } = await import("../new-badge");
    mod.markBadgeOpened(USER, DAY, cardKey(DAY, cards[0]));
    mod.markBadgeOpened(USER, DAY, cards[1] ? cardKey(DAY, cards[1]) : "");

    mod.reconcileBadges(USER, DAY, cards);
    const snap = mod.getBadgeSnapshot(USER, DAY);
    expect(snap.size).toBe(0);
  });

  it("差分の無い2回目 reconcile は新規キーを検出しない（baseline=current）", async () => {
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");
    const cards = [makeCard({ taskName: "X" })];

    mod.reconcileBadges(USER, DAY, cards);
    // baseline は current と等しくなった。new_keys には既存 New が残るが、
    // 2回目で detected が空であることは baseline が書き換わったことで担保される。
    expect(readStored(BASELINE_KEY)).toEqual([cardKey(DAY, cards[0])]);

    // 2回目 reconcile 後も baseline は同一で、detected 由来の増分は無い。
    mod.reconcileBadges(USER, DAY, cards);
    expect(readStored(BASELINE_KEY)).toEqual([cardKey(DAY, cards[0])]);
  });
});

describe("badge-store: markBadgeOpened", () => {
  // 契約3: open するとキーが new_keys から消え opened に入り、snapshot からも消える（Flutter onOpened）。
  it("開封キーは new_keys から削除され opened に追加され、スナップショットから消える", async () => {
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");

    const card = makeCard({ taskName: "open-me" });
    const key = cardKey(DAY, card);
    mod.reconcileBadges(USER, DAY, [card]);
    expect(mod.getBadgeSnapshot(USER, DAY).has(key)).toBe(true);

    mod.markBadgeOpened(USER, DAY, key);

    // new_keys から削除
    expect(readStored(NEW_KEYS_KEY)).not.toContain(key);
    // opened に追加
    expect(readStored(OPENED_KEY)).toContain(key);
    // スナップショットから消える
    expect(mod.getBadgeSnapshot(USER, DAY).has(key)).toBe(false);
  });
});

describe("badge-store: opened 永続化", () => {
  // 契約4: 開封済みカードは同一カードで再 reconcile しても New に戻らない（Flutter _filterAlreadyOpened）。
  it("開封済みカードは同一カードでの再 reconcile で New に再表示されない", async () => {
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");

    const card = makeCard({ taskName: "sticky" });
    const key = cardKey(DAY, card);

    mod.reconcileBadges(USER, DAY, [card]);
    mod.markBadgeOpened(USER, DAY, key);
    expect(mod.getBadgeSnapshot(USER, DAY).has(key)).toBe(false);

    // 同一カードで再フェッチ → New に戻ってはいけない。
    mod.reconcileBadges(USER, DAY, [card]);
    expect(mod.getBadgeSnapshot(USER, DAY).has(key)).toBe(false);
  });
});

describe("badge-store: 古い opened キーの掃除", () => {
  // 契約5: カードが消えた当該日の opened キーは purge。別日の opened キーは残る（Flutter _cleanupStaleOpenedKeys）。
  it("最新カードに無い当該日の opened キーは削除され、別日の opened キーは保持される", async () => {
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");

    const card = makeCard({ taskName: "will-vanish" });
    const key = cardKey(DAY, card);

    // 別日（dayID=3）の opened キーを事前注入。掃除は当該日 prefix のみが対象。
    const otherDayKey = `3|other|09:00|10:00|本部`;
    window.localStorage.setItem(OPENED_KEY, JSON.stringify([otherDayKey]));

    mod.reconcileBadges(USER, DAY, [card]);
    mod.markBadgeOpened(USER, DAY, key);
    expect(readStored(OPENED_KEY)).toEqual(
      expect.arrayContaining([key, otherDayKey]),
    );

    // 当該カードを除いて再 reconcile（空リスト）→ key は purge、別日キーは生存。
    mod.reconcileBadges(USER, DAY, []);
    const opened = readStored(OPENED_KEY) ?? [];
    expect(opened).not.toContain(key);
    expect(opened).toContain(otherDayKey);
  });
});

describe("badge-store: スナップショット参照安定性", () => {
  // 契約6: 変更なしで2回呼ぶと同一 Set 参照（useSyncExternalStore 要件）。
  it("無変更で連続呼び出しすると同一 Set 参照を返す（Object.is）", async () => {
    const mod = await loadModule();
    mod.reconcileBadges(USER, DAY, [makeCard({ taskName: "ref" })]);

    const a = mod.getBadgeSnapshot(USER, DAY);
    const b = mod.getBadgeSnapshot(USER, DAY);
    expect(Object.is(a, b)).toBe(true);
  });
});

describe("badge-store: 購読通知", () => {
  // 契約7: reconcileBadges / markBadgeOpened ごとに listener が1回発火する。
  it("subscribeBadges のリスナーは reconcile / open ごとに1回発火する", async () => {
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");

    const listener = vi.fn();
    const unsubscribe = mod.subscribeBadges(listener);

    const card = makeCard({ taskName: "notify" });
    mod.reconcileBadges(USER, DAY, [card]);
    expect(listener).toHaveBeenCalledTimes(1);

    mod.markBadgeOpened(USER, DAY, cardKey(DAY, card));
    expect(listener).toHaveBeenCalledTimes(2);

    // unsubscribe 後は発火しない。
    unsubscribe();
    mod.reconcileBadges(USER, DAY, [card]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("badge-store: 壊れたストレージの耐性", () => {
  // 契約8a: new_keys が非 JSON → snapshot は空・throw しない（Flutter L385-388 不正型はリセット相当）。
  it("new_keys に非 JSON が入っていてもスナップショットは空で例外を投げない", async () => {
    window.localStorage.setItem(NEW_KEYS_KEY, "{not valid json");
    const mod = await loadModule();

    let snap: ReadonlySet<string> | undefined;
    expect(() => {
      snap = mod.getBadgeSnapshot(USER, DAY);
    }).not.toThrow();
    expect(snap?.size).toBe(0);
  });

  // 契約8b: baseline が非配列 JSON → 初回ロード扱い（全 New）。loadSetOrNull は非配列を null に潰す。
  it("baseline が非配列 JSON のときは初回ロード扱いで全カードを New とする", async () => {
    // baseline をオブジェクト（非配列）にしておく。
    window.localStorage.setItem(BASELINE_KEY, JSON.stringify({ bogus: true }));
    const mod = await loadModule();
    const { cardKey } = await import("../new-badge");

    const card = makeCard({ taskName: "first-load" });
    const key = cardKey(DAY, card);

    expect(() => mod.reconcileBadges(USER, DAY, [card])).not.toThrow();
    // 非配列 baseline は null（未保存）扱い → detectNewKeys が全件 New。
    expect(mod.getBadgeSnapshot(USER, DAY).has(key)).toBe(true);
  });
});

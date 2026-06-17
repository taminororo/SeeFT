// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// reviewed-store.ts は Flutter mobile の `reviewedTaskNameBox`（Hive）の移植。
// 永続化された「レビュー済みタスク名」集合を localStorage に保持し、
// 既にレビュー済みのタスクはレビューフォームの表示を skip する挙動を支える。
//
// オラクル（mobile）:
//   - review_bottom_sheet.dart L119: 送信成功時 `reviewedTaskNameBox.put(widget.taskName, true)`
//       → markReviewed(taskName) 相当。以降そのタスクは reviewed=true。
//   - my_shift_page.dart L330-334 _showReviewFormIfNeeded:
//       `reviewedTaskNameBox.get(shiftCard.taskName, defaultValue: false) == true`
//       が true なら `return`（フォームを表示しない）。
//       → isReviewed(taskName) が skip 判定の真偽を提供する。
//   - Hive box はオンディスク永続なのでアプリ再起動を跨いで保持される。
//       → web では localStorage が module 再評価（再起動相当）を跨いで保持される。
//
// localStorage を毎テストでクリアし、vi.resetModules() + dynamic import で
// モジュール内の状態を持たない（localStorage が唯一の真実）ことを確認する。

const STORAGE_KEY = "reviewed_tasks";

async function importStore() {
  return import("../reviewed-store");
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("reviewed-store（reviewedTaskNameBox の移植）", () => {
  it("markReviewed したタスクは isReviewed が true（put(taskName, true) 相当）", async () => {
    const { isReviewed, markReviewed } = await importStore();

    expect(isReviewed("会場設営")).toBe(false);
    markReviewed("会場設営");
    expect(isReviewed("会場設営")).toBe(true);
  });

  it("vi.resetModules() 後の再 import を跨いで永続する（アプリ再起動を跨ぐ Hive box 相当）", async () => {
    const first = await importStore();
    first.markReviewed("受付");
    expect(first.isReviewed("受付")).toBe(true);

    // 再起動シミュレーション: モジュール状態を捨てて読み直す。
    // localStorage は維持されるため reviewed 判定が残っていなければならない。
    vi.resetModules();
    const second = await importStore();
    expect(second).not.toBe(first);
    expect(second.isReviewed("受付")).toBe(true);
  });

  it("一度も markReviewed していないタスクは未レビュー（get の defaultValue: false 相当）", async () => {
    const { isReviewed, markReviewed } = await importStore();

    markReviewed("受付");
    // put された "受付" 以外のタスクは false のまま → レビューフォームを表示する側。
    expect(isReviewed("巡回")).toBe(false);
    expect(isReviewed("")).toBe(false);
  });

  it("storage の JSON が壊れていても isReviewed は false を返し、throw しない", async () => {
    localStorage.setItem(STORAGE_KEY, "{ this is not valid json");
    const { isReviewed } = await importStore();

    expect(() => isReviewed("会場設営")).not.toThrow();
    expect(isReviewed("会場設営")).toBe(false);
  });

  it("storage が配列でない（オブジェクト等）場合も空集合として扱う", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 会場設営: true }));
    const { isReviewed } = await importStore();

    // 旧 Hive 形式（key->bool マップ）が紛れ込んでも誤って reviewed 扱いしない。
    expect(isReviewed("会場設営")).toBe(false);
  });

  it("複数タスク名を独立に追跡する", async () => {
    const { isReviewed, markReviewed } = await importStore();

    markReviewed("会場設営");
    markReviewed("撤収");

    expect(isReviewed("会場設営")).toBe(true);
    expect(isReviewed("撤収")).toBe(true);
    expect(isReviewed("受付")).toBe(false);

    // 同じタスクを再度 markReviewed しても冪等（集合なので重複しない）。
    markReviewed("会場設営");
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as string[];
    expect(parsed.filter((t) => t === "会場設営")).toHaveLength(1);
    expect(parsed).toEqual(expect.arrayContaining(["会場設営", "撤収"]));
  });
});

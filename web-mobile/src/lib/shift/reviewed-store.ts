// レビュー済みタスク名の永続化。Flutter 版 `reviewedTaskNameBox` の移植。
// タスク名の集合を localStorage に保持する。

const KEY = "reviewed_tasks";

function load(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function isReviewed(taskName: string): boolean {
  return load().has(taskName);
}

export function markReviewed(taskName: string): void {
  if (typeof window === "undefined") return;
  const set = load();
  set.add(taskName);
  window.localStorage.setItem(KEY, JSON.stringify([...set]));
}

import type { ShiftCard } from "@/lib/api/shifts";

// Flutter 版 my_shift_page.dart の「New」バッジ判定ロジックの移植（ピュア関数）。
// カードキーは dayID|taskName|startTime|endTime|place で、4 項目をキー自身が内包する。
// そのため「変更検出」は実質「前回キー集合に無いキー＝New」に帰着する。

function normalizeText(value: string): string {
  return value.trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// "8:0" / "8:00" / "08:00" の揺れをキー生成時に吸収する。
export function normalizeTime(value: string): string {
  const raw = value.trim();
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (!m) return raw;
  const hour = clamp(Number.parseInt(m[1], 10) || 0, 0, 99);
  const minute = clamp(Number.parseInt(m[2], 10) || 0, 0, 59);
  return `${pad2(hour)}:${pad2(minute)}`;
}

// カードの一意キー（日付＋タスク名＋開始／終了＋集合場所）。
export function cardKey(dayID: number, card: ShiftCard): string {
  const taskName = normalizeText(card.taskName);
  const startTime = normalizeTime(card.startTime);
  const endTime = normalizeTime(card.endTime);
  const place = normalizeText(card.place);
  return `${dayID}|${taskName}|${startTime}|${endTime}|${place}`;
}

// New 対象キーの検出。baseline（前回キー集合）が null の初回は全カードを New とみなす。
export function detectNewKeys(
  dayID: number,
  baseline: Set<string> | null,
  cards: ShiftCard[],
): Set<string> {
  const currentKeys = cards.map((c) => cardKey(dayID, c));
  if (baseline === null) {
    return new Set(currentKeys);
  }
  const result = new Set<string>();
  for (const key of currentKeys) {
    if (!baseline.has(key)) {
      result.add(key);
    }
  }
  return result;
}

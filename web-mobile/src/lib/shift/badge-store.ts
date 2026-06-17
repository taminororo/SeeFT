import type { ShiftCard } from "@/lib/api/shifts";
import { cardKey, detectNewKeys } from "./new-badge";

// 「New」バッジの表示状態を持つ外部ストア（localStorage 永続化）。
// useSyncExternalStore から購読する。Flutter 版 my_shift_page.dart の
// openedCardKeysBox / new_keys / baseline 管理を移植したもの。
//
// 永続化キー（Flutter の Hive キーに対応）:
//   opened_keys_{userID}              … 開封済みカードキー集合
//   new_keys_{userID}_{dayID}         … 現在 New 表示中のカードキー集合
//   shift_baseline_{userID}_{dayID}   … 差分検出の基準となる前回キー集合

type Listener = () => void;

const listeners = new Set<Listener>();
// 表示用 New キー集合のキャッシュ（useSyncExternalStore のため参照を安定させる）。
const cache = new Map<string, Set<string>>();
const EMPTY: ReadonlySet<string> = new Set();

const mapKey = (userID: number, dayID: number) => `${userID}_${dayID}`;
const openedStorageKey = (userID: number) => `opened_keys_${userID}`;
const newKeysStorageKey = (userID: number, dayID: number) =>
  `new_keys_${userID}_${dayID}`;
const baselineStorageKey = (userID: number, dayID: number) =>
  `shift_baseline_${userID}_${dayID}`;

function loadSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

// baseline は「未保存(null)」と「空集合」を区別する必要があるため別関数。
function loadSetOrNull(key: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : null;
  } catch {
    return null;
  }
}

function saveSet(key: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...set]));
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeBadges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// 表示用の New キー集合（永続化された new キー − opened）。参照は安定させる。
export function getBadgeSnapshot(userID: number, dayID: number): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY;
  const mk = mapKey(userID, dayID);
  const cached = cache.get(mk);
  if (cached) return cached;

  const opened = loadSet(openedStorageKey(userID));
  const persisted = loadSet(newKeysStorageKey(userID, dayID));
  const visible = new Set([...persisted].filter((k) => !opened.has(k)));
  cache.set(mk, visible);
  return visible;
}

export function getBadgeServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

// サーバ取得後の照合。Flutter _loadShiftCardDataList のフェッチ後処理に相当。
// data が変わるたびに呼ぶ（キャッシュ復元時も含む。同一データなら detected が空になり無変化）。
export function reconcileBadges(
  userID: number,
  dayID: number,
  cards: ShiftCard[],
): void {
  const opened = loadSet(openedStorageKey(userID));
  const baseline = loadSetOrNull(baselineStorageKey(userID, dayID));
  const existingNew = loadSet(newKeysStorageKey(userID, dayID));

  // 既存 New ∪ 新規検出 − opened
  const detected = detectNewKeys(dayID, baseline, cards);
  const union = new Set<string>([...existingNew, ...detected]);
  const visible = new Set([...union].filter((k) => !opened.has(k)));

  // 最新カードに存在しない opened キーを掃除（当該日分のみ）。
  const currentKeys = new Set(cards.map((c) => cardKey(dayID, c)));
  const prefix = `${dayID}|`;
  let openedChanged = false;
  for (const key of [...opened]) {
    if (key.startsWith(prefix) && !currentKeys.has(key)) {
      opened.delete(key);
      openedChanged = true;
    }
  }
  if (openedChanged) {
    saveSet(openedStorageKey(userID), opened);
  }

  saveSet(newKeysStorageKey(userID, dayID), visible);
  saveSet(baselineStorageKey(userID, dayID), currentKeys);

  cache.set(mapKey(userID, dayID), visible);
  emit();
}

// カードを開いたとき（New を消し、opened に追加）。Flutter onOpened に相当。
export function markBadgeOpened(userID: number, dayID: number, key: string): void {
  const persisted = loadSet(newKeysStorageKey(userID, dayID));
  persisted.delete(key);
  saveSet(newKeysStorageKey(userID, dayID), persisted);

  const opened = loadSet(openedStorageKey(userID));
  opened.add(key);
  saveSet(openedStorageKey(userID), opened);

  const visible = new Set(getBadgeSnapshot(userID, dayID));
  visible.delete(key);
  cache.set(mapKey(userID, dayID), visible);
  emit();
}

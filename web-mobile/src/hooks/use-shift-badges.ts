"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getBadgeServerSnapshot,
  getBadgeSnapshot,
  markBadgeOpened,
  subscribeBadges,
} from "@/lib/shift/badge-store";

// 指定ユーザ・日付の「New」バッジ表示状態を購読するフック。
// 表示集合の更新は外部ストアが通知するため、React の setState を effect 内で呼ばない
// （react-hooks/set-state-in-effect を構造的に回避）。
export function useShiftBadges(userID: number, dayID: number) {
  const visible = useSyncExternalStore(
    subscribeBadges,
    () => getBadgeSnapshot(userID, dayID),
    getBadgeServerSnapshot,
  );

  const isNew = useCallback((key: string) => visible.has(key), [visible]);
  const markOpened = useCallback(
    (key: string) => markBadgeOpened(userID, dayID, key),
    [userID, dayID],
  );

  return { isNew, markOpened };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MdWarning } from "react-icons/md";
import clsx from "clsx";
import { getShiftCards } from "@/lib/api/shifts";
import { useAuth } from "@/hooks/use-auth";
import { useShiftBadges } from "@/hooks/use-shift-badges";
import { reconcileBadges } from "@/lib/shift/badge-store";
import { cardKey, normalizeTime } from "@/lib/shift/new-badge";
import { isReviewed } from "@/lib/shift/reviewed-store";
import { ShiftCard } from "@/components/shift/shift-card";
import { RefreshButton } from "@/components/shift/refresh-button";
import { ReviewSheet } from "@/components/shift/review-sheet";
import { StatusMessage } from "@/components/ui/status-message";
import { config } from "@/lib/config";

// Flutter 版 `my_shift_page.dart` の移植（読み取り＋オフラインキャッシュ＋New バッジ＋レビュー）。
// 天気は晴れ(1)で固定（Flutter 版と同じ）。

const WEATHER_ID = 1;
const DAYS = [
  { id: 1, label: "準備日" },
  { id: 2, label: "1日目" },
  { id: 3, label: "2日目" },
] as const;

// dayID と技大祭の日付の対応（レビュー表示タイミング判定用）。
const NUTFES_DATE: Record<number, string> = {
  1: config.nutfesPreparationDay,
  2: config.nutfesDay1,
  3: config.nutfesDay2,
};

// シフト終了時刻(ms)。dateStr + endTime("HH:MM") から算出。パース不能なら null。
function shiftEndMs(dateStr: string, endTime: string): number | null {
  const t = normalizeTime(endTime);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const ms = new Date(`${dateStr}T${t}:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export default function ShiftsPage() {
  const { userID } = useAuth();
  const [selectedDayID, setSelectedDayID] = useState(1);

  const { data, dataUpdatedAt, isPending, isFetching, isError, refetch } =
    useQuery({
      queryKey: ["shiftCards", userID, selectedDayID, WEATHER_ID],
      queryFn: () => getShiftCards(userID, selectedDayID, WEATHER_ID),
      enabled: userID !== 0,
    });

  // フェッチ／キャッシュ復元のたびに New バッジを照合（ストア更新のみ）。
  useEffect(() => {
    if (data) {
      reconcileBadges(userID, selectedDayID, data);
    }
  }, [data, userID, selectedDayID]);

  const { isNew, markOpened } = useShiftBadges(userID, selectedDayID);
  const cards = data ?? [];

  // 終了済み・未レビューのシフトにレビューを促す（Flutter _showReviewFormIfNeeded 相当）。
  // セッション中にスキップ／送信したものは dismissed で再表示しない。
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const pendingReviews = useMemo(() => {
    if (!data) return [];
    const dateStr = NUTFES_DATE[selectedDayID];
    if (!dateStr) return [];
    // フェッチ時刻を「現在」とみなす（Flutter も load コールバック時の now を使用）。
    const now = dataUpdatedAt;
    const names = data
      .filter((card) => {
        if (isReviewed(card.taskName)) return false;
        const endMs = shiftEndMs(dateStr, card.endTime);
        return endMs !== null && now > endMs;
      })
      .map((card) => card.taskName);
    return [...new Set(names)];
  }, [data, selectedDayID, dataUpdatedAt]);
  const currentReview = pendingReviews.find((name) => !dismissed.has(name)) ?? null;
  const closeReview = () => {
    if (currentReview) {
      setDismissed((prev) => new Set(prev).add(currentReview));
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* ヘッダ（マイシフト）＋日付タブ */}
      <header className="sticky top-0 z-10 bg-main">
        <div className="flex h-[63px] items-center px-4">
          <h1 className="text-lg font-bold text-text-white">マイシフト</h1>
        </div>
        <div className="flex gap-1 px-4 pb-3">
          {DAYS.map((day) => {
            const active = day.id === selectedDayID;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => setSelectedDayID(day.id)}
                className={clsx(
                  "flex-1 rounded-pill py-1.5 text-md transition-colors",
                  active ? "bg-base text-main" : "text-gray-light",
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* 更新ボタン */}
      <div className="flex justify-center py-2">
        <RefreshButton onClick={() => void refetch()} isLoading={isFetching} />
      </div>

      {/* シフトカード一覧 */}
      <div className="flex flex-1 flex-col px-8 pb-8">
        {isPending ? (
          <StatusMessage>読み込み中...</StatusMessage>
        ) : isError ? (
          <StatusMessage>シフトの取得に失敗しました</StatusMessage>
        ) : cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-gray-dark">
            <MdWarning size={48} className="text-gray-light" />
            <p className="text-md">データがありません</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {cards.map((card, index) => {
              const key = cardKey(selectedDayID, card);
              return (
                <ShiftCard
                  key={`${key}-${index}`}
                  data={card}
                  isNew={isNew(key)}
                  onOpened={() => markOpened(key)}
                />
              );
            })}
          </div>
        )}
      </div>

      {currentReview && (
        <ReviewSheet
          taskName={currentReview}
          userID={userID}
          onClose={closeReview}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MdWarning } from "react-icons/md";
import clsx from "clsx";
import { getShiftCards } from "@/lib/api/shifts";
import { useAuth } from "@/hooks/use-auth";
import { useShiftBadges } from "@/hooks/use-shift-badges";
import { reconcileBadges } from "@/lib/shift/badge-store";
import { cardKey } from "@/lib/shift/new-badge";
import { ShiftCard } from "@/components/shift/shift-card";
import { RefreshButton } from "@/components/shift/refresh-button";
import { StatusMessage } from "@/components/ui/status-message";

// Flutter 版 `my_shift_page.dart` の移植（読み取り＋オフラインキャッシュ＋New バッジ）。
// 天気は晴れ(1)で固定（Flutter 版と同じ）。レビューシートは Phase 2 で追加。

const WEATHER_ID = 1;
const DAYS = [
  { id: 1, label: "準備日" },
  { id: 2, label: "1日目" },
  { id: 3, label: "2日目" },
] as const;

export default function ShiftsPage() {
  const { userID } = useAuth();
  const [selectedDayID, setSelectedDayID] = useState(1);

  const { data, isPending, isFetching, isError, refetch } = useQuery({
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
    </div>
  );
}

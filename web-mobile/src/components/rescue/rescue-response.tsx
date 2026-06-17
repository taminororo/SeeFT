"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  getAllRescueResponses,
  getMyRescueResponses,
  type RescueResponse,
} from "@/lib/api/rescues";
import { useAuth } from "@/hooks/use-auth";
import { RefreshButton } from "@/components/shift/refresh-button";
import { useState } from "react";

// Flutter 版 `rescue_response_tab.dart` の移植。本部からの返答を表示するタブ。

type Filter = "my" | "all";

function describe(r: RescueResponse): { titleRescue: string; subTitle: string } {
  switch (r.type) {
    case "trouble":
      return {
        titleRescue: `【トラブル】${r.content.detail}`,
        subTitle:
          `対応番号: T${r.id}\n送信者: ${r.userName}\n` +
          `発生タスク: ${r.content.task}\n発生場所: ${r.content.place}\n発生時刻: ${r.time}`,
      };
    case "question":
      return {
        titleRescue: `【質問】${r.content.question}`,
        subTitle: `対応番号: Q${r.id}\n送信者: ${r.userName}\n発生時刻: ${r.time}`,
      };
    case "shorthanded":
      return {
        titleRescue: `【人が来ない】${r.content.task}（${r.content.missingNumber}人）`,
        subTitle:
          `対応番号: S${r.id}\n送信者: ${r.userName}\n` +
          `送り先の場所: ${r.content.place}\n発生時刻: ${r.time}`,
      };
  }
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "done"
      ? { cls: "text-status-done border-status-done", text: "対応済" }
      : status === "inProgress"
        ? { cls: "text-status-progress border-status-progress", text: "対応中" }
        : { cls: "text-error border-error", text: "未対応" };
  return (
    <span
      className={clsx(
        "shrink-0 self-start rounded-normal border-2 p-1 text-sm font-bold",
        style.cls,
      )}
    >
      {style.text}
    </span>
  );
}

function ResponseItem({ response }: { response: RescueResponse }) {
  const { titleRescue, subTitle } = describe(response);
  const hasResponse = response.response !== "";
  return (
    <div className="flex gap-3 py-3">
      <StatusBadge status={response.status} />
      <div className="min-w-0 flex-1">
        <p className="text-md text-text-black">{titleRescue}</p>
        <p
          className={clsx(
            "font-bold text-md",
            hasResponse ? "text-main" : "text-gray-dark",
          )}
        >
          {hasResponse
            ? `本部からの返答: ${response.response}`
            : "本部からの返答はまだありません。"}
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-gray-dark">{subTitle}</p>
      </div>
    </div>
  );
}

export function RescueResponse() {
  const { userID } = useAuth();
  const [filter, setFilter] = useState<Filter>("my");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["rescues", filter, userID],
    queryFn: () =>
      filter === "my" ? getMyRescueResponses(userID) : getAllRescueResponses(),
    enabled: userID !== 0,
  });

  const responses = data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-2 px-8 py-4">
      {/* 表示範囲フィルタ */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-md text-gray-dark">表示範囲</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="flex-1 rounded-normal border border-gray-dark bg-white px-2 py-1.5 text-md text-text-black"
        >
          <option value="my">自分が送信したレスキュー</option>
          <option value="all">全てのレスキュー</option>
        </select>
      </div>

      {/* 一覧 or 空状態 */}
      {responses.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 py-8 text-center">
          <p className="text-md">
            <span className="text-text-black">
              送信したレスキューはまだありません。
            </span>
            <br />
            <span className="text-gray-dark">
              レスキューを送信するとここに本部からの返答が表示されます。
            </span>
          </p>
        </div>
      ) : (
        <div className="flex-1 divide-y divide-gray-light overflow-y-auto">
          {responses.map((r) => (
            <ResponseItem key={`${r.type}-${r.id}`} response={r} />
          ))}
        </div>
      )}

      {/* フッタ（更新） */}
      <hr className="border-gray-light" />
      <p className="text-sm text-gray-dark">
        最新の情報を取得するには、
        <br />
        「更新」ボタンを押してください。
      </p>
      <div className="self-start">
        <RefreshButton onClick={() => void refetch()} isLoading={isFetching} />
      </div>
    </div>
  );
}

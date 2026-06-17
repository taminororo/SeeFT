"use client";

import { useQuery } from "@tanstack/react-query";
import { getManuals } from "@/lib/api/tasks";
import { StatusMessage } from "@/components/ui/status-message";

// Flutter 版 `manual_list_page.dart` の移植。
// タスク名のリスト、タップで外部マニュアル URL を開く。
export default function ManualsPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["manuals"],
    queryFn: getManuals,
  });

  if (isPending) {
    return <StatusMessage>読み込み中...</StatusMessage>;
  }
  if (isError) {
    return <StatusMessage>マニュアルの取得に失敗しました</StatusMessage>;
  }
  if (data.length === 0) {
    return <StatusMessage>マニュアルがありません</StatusMessage>;
  }

  return (
    <ul className="p-8">
      {data.map((manual, index) => (
        <li
          key={`${manual.task}-${index}`}
          className="border-b border-gray-light"
        >
          <a
            href={manual.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center text-md text-text-black"
          >
            {manual.task}
          </a>
        </li>
      ))}
    </ul>
  );
}

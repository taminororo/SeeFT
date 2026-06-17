"use client";

import { MdRefresh } from "react-icons/md";
import clsx from "clsx";

// Flutter 版 `refresh_button.dart` の移植。outline・base 背景、読込中は無効化＋grayDark。
export function RefreshButton({
  onClick,
  isLoading,
}: {
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={clsx(
        "inline-flex items-center gap-1 rounded-pill border bg-base px-6 py-2.5 text-sm",
        isLoading ? "border-gray-dark text-gray-dark" : "border-main text-main",
      )}
    >
      <MdRefresh size={16} />
      {isLoading ? "読み込み中..." : "更新"}
    </button>
  );
}

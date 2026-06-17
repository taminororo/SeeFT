// Flutter 版 `new_badge.dart` の移植。main 背景・白文字・xs 太字の "new!!" バッジ。
export function NewBadge() {
  return (
    <span className="rounded-normal bg-main px-1 py-0.5 text-xs font-bold text-text-white">
      new!!
    </span>
  );
}

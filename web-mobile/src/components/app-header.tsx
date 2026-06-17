// Flutter 版 `app_bar.dart`（CustomAppBar）の移植。
// 高さ 63px、main 背景、タイトルは左寄せ・lg・太字・白文字。

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-[63px] shrink-0 items-center bg-main px-4">
      <h1 className="text-lg font-bold text-text-white">{title}</h1>
    </header>
  );
}

// ローディング・エラー・空状態などの中央寄せメッセージ。各画面で再利用する。
export function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-dark">
      {children}
    </div>
  );
}

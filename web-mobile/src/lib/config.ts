// アプリ設定。Flutter 版 `mobile/lib/configs/constant.dart` の移植。
// 値は --dart-define ではなく NEXT_PUBLIC_* 環境変数から取得する（非機密のクライアント設定）。
// デフォルト値は constant.dart と一致させている。

export const config = {
  appName: "SeeFT",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:1234",
  chairpersonName: process.env.NEXT_PUBLIC_CHAIRPERSON_NAME ?? "委員長",
  chairpersonPhoneNumber:
    process.env.NEXT_PUBLIC_CHAIRPERSON_PHONE_NUMBER ?? "00011112222",
  seeftInstructionsUrl:
    process.env.NEXT_PUBLIC_SEEFT_INSTRUCTIONS_URL ?? "https://example.com",
  wholeShiftUrl: process.env.NEXT_PUBLIC_WHOLE_SHIFT_URL ?? "https://example.com",
  // 各日程の日付（レビュー表示タイミングの判定に使用）
  nutfesPreparationDay:
    process.env.NEXT_PUBLIC_NUTFES_PREPARATION_DAY ?? "2025-09-12",
  nutfesDay1: process.env.NEXT_PUBLIC_NUTFES_DAY1 ?? "2025-09-13",
  nutfesDay2: process.env.NEXT_PUBLIC_NUTFES_DAY2 ?? "2025-09-14",
  nutfesTidyingUpDay:
    process.env.NEXT_PUBLIC_NUTFES_TIDYING_UP_DAY ?? "2025-09-15",
} as const;

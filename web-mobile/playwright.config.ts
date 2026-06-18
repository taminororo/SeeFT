import { defineConfig } from "@playwright/test";

// E2E 設定。実機相当のモバイルビューポート（iPhone 12 相当 390x844）で、
// インストール済みの Chrome（channel: "chrome"）を使うためブラウザの
// ダウンロードは不要。dev サーバが既に起動していれば再利用する。
export default defineConfig({
  testDir: "./tests/e2e",
  // 規約上の *.spec / *.test に加え、本リポジトリの命名 *.e2e.ts も拾う。
  testMatch: /\.(spec|test|e2e)\.ts$/,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    // CI: 同梱の Chromium を使う（`playwright install --with-deps chromium` で導入）。
    // ローカル: インストール済みの Google Chrome（channel: "chrome"）を使う。
    ...(process.env.CI ? {} : { channel: "chrome" }),
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  // CI では dev サーバを自前で起動し :3000 を待ってから実行するため webServer は定義しない。
  // ローカルでは既に起動済みの dev サーバを再利用する（なければ起動する）。
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

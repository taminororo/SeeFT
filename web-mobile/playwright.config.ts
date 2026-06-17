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
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

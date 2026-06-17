import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// 単体テストは既定で node 環境。localStorage を触る badge-store / reviewed-store の
// テストはファイル先頭の // @vitest-environment jsdom コメントで jsdom に切り替える。
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 本番用に standalone 出力（最小ランタイム）。
  output: "standalone",
};

export default nextConfig;

import type { MetadataRoute } from "next";

// PWA マニフェスト（インストール可能・アプリらしい表示）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SeeFT",
    short_name: "SeeFT",
    description: "技大祭スタッフ向けアプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#009688",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

"use client";

import { useState } from "react";
import clsx from "clsx";
import { RescueRequest } from "@/components/rescue/rescue-request";
import { RescueResponse } from "@/components/rescue/rescue-response";

// Flutter 版 `rescue_page.dart` の移植。「レスキュー送信」「本部からの返答」の 2 サブタブ。

type Tab = "request" | "response";
const TABS = [
  { id: "request", label: "レスキュー送信" },
  { id: "response", label: "本部からの返答" },
] as const;

export default function RescuePage() {
  const [tab, setTab] = useState<Tab>("request");

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-main">
        <div className="flex h-[63px] items-center px-4">
          <h1 className="text-lg font-bold text-text-white">緊急時対応</h1>
        </div>
        <div className="flex gap-1 px-4 pb-3">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={clsx(
                  "flex-1 rounded-pill py-1.5 text-md transition-colors",
                  active ? "bg-base text-main" : "text-gray-light",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {tab === "request" ? <RescueRequest /> : <RescueResponse />}
    </div>
  );
}

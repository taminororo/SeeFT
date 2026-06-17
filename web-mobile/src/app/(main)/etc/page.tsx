"use client";

import { useRouter } from "next/navigation";
import {
  MdArrowForwardIos,
  MdHelpOutline,
  MdLogout,
  MdToday,
} from "react-icons/md";
import type { IconType } from "react-icons";
import { useAuth } from "@/hooks/use-auth";
import { config } from "@/lib/config";

// Flutter 版 `etc_page.dart` の移植。操作説明 / 全体シフト / ログアウト。

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function EtcPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  const items: {
    text: string;
    explanation: string;
    Icon: IconType;
    onClick: () => void;
  }[] = [
    {
      text: "操作説明",
      explanation: "SeeFTの操作説明を開きます",
      Icon: MdHelpOutline,
      onClick: () => openExternal(config.seeftInstructionsUrl),
    },
    {
      text: "全体シフト",
      explanation: "全局員のシフトを確認できます",
      Icon: MdToday,
      onClick: () => openExternal(config.wholeShiftUrl),
    },
    {
      text: "ログアウト",
      explanation: "ログアウトします",
      Icon: MdLogout,
      onClick: () => {
        signOut();
        router.replace("/sign-in");
      },
    },
  ];

  return (
    <div className="p-8">
      <ul className="divide-y divide-gray-light">
        {items.map(({ text, explanation, Icon, onClick }) => (
          <li key={text}>
            <button
              type="button"
              onClick={onClick}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <Icon size={24} className="shrink-0 text-main" />
              <span className="flex-1">
                <span className="block font-bold text-md text-text-black">
                  {text}
                </span>
                <span className="block text-sm text-gray-dark">{explanation}</span>
              </span>
              <MdArrowForwardIos size={16} className="text-gray-dark" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

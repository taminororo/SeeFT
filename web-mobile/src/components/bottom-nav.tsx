"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  MdToday,
  MdOutlineToday,
  MdQuiz,
  MdOutlineQuiz,
  MdError,
  MdErrorOutline,
  MdMoreHoriz,
  MdOutlineMoreHoriz,
} from "react-icons/md";
import type { IconType } from "react-icons";

// Flutter 版 `layout.dart` のボトムナビゲーションの移植（4 タブ固定）。
// 選択時 main 色＋太字、未選択時 grayDark。高さ 78px。

type Tab = {
  href: string;
  label: string;
  Icon: IconType;
  ActiveIcon: IconType;
};

const TABS: Tab[] = [
  { href: "/shifts", label: "マイシフト", Icon: MdOutlineToday, ActiveIcon: MdToday },
  { href: "/manuals", label: "マニュアル", Icon: MdOutlineQuiz, ActiveIcon: MdQuiz },
  { href: "/rescue", label: "緊急時対応", Icon: MdErrorOutline, ActiveIcon: MdError },
  { href: "/etc", label: "その他", Icon: MdOutlineMoreHoriz, ActiveIcon: MdMoreHoriz },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 flex h-[78px] shrink-0 items-stretch border-t border-gray-light bg-base">
      {TABS.map(({ href, label, Icon, ActiveIcon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const RenderedIcon = active ? ActiveIcon : Icon;
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex flex-1 flex-col items-center justify-center gap-1",
              active ? "text-main" : "text-gray-dark",
            )}
          >
            <RenderedIcon size={24} />
            <span className={clsx("text-xs", active && "font-bold")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useState } from "react";
import {
  MdAccessTime,
  MdExpandMore,
  MdLocationOn,
  MdQuiz,
} from "react-icons/md";
import clsx from "clsx";
import type { ShiftCard as ShiftCardModel, ShiftMembersGroup } from "@/lib/api/shifts";
import { NewBadge } from "./new-badge";

// Flutter 版 `shift_card.dart` の移植。展開で詳細セクションを表示し、
// New 状態のカードを開いたら onOpened を呼ぶ。

function formatGroup(group: ShiftMembersGroup): string {
  const header = `${group.sTime}〜${group.eTime}`;
  const members = group.members
    .map((m) => `(${m.bureau}${m.grade}) ${m.name}`)
    .join(", ");
  return `${header}\n${members}`;
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="py-2">
      <p className="text-xs font-bold text-text-black">{title}</p>
      <div className="mt-1 space-y-1">
        {lines.map((line, i) => (
          <p
            key={i}
            className="whitespace-pre-line text-xs leading-relaxed text-text-black"
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

const TROUBLE_GUIDE = [
  "以下の順に対応してください。",
  "1. マニュアルを確認してください。",
  "2. 近くの人や近くの先輩に相談してください。",
  "3. 「緊急時対応」ページから本部に連絡してください。",
];

export function ShiftCard({
  data,
  isNew,
  onOpened,
}: {
  data: ShiftCardModel;
  isNew: boolean;
  onOpened?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasUrl = data.url !== "";

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // New のカードを開いたら開封済みにする（Flutter onExpansionChanged 相当）。
    if (next && isNew) {
      onOpened?.();
    }
  };

  return (
    <div className="rounded-normal border border-gray-light bg-base p-2 shadow-sm">
      {/* 時刻とマニュアルを開くボタン */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-0.5 text-sm text-text-black">
          <MdAccessTime size={16} />
          {data.startTime}〜{data.endTime}
        </span>
        {hasUrl ? (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-pill bg-link px-2 py-1 text-sm text-text-white"
          >
            <MdQuiz size={16} />
            マニュアル
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-pill bg-gray-light px-2 py-1 text-sm text-gray-dark">
            <MdQuiz size={16} />
            マニュアルなし
          </span>
        )}
      </div>

      {/* タスク名と New バッジ */}
      <div className="mt-1 flex items-center gap-2">
        <span className="font-bold text-md text-text-black">{data.taskName}</span>
        {isNew && <NewBadge />}
      </div>

      <hr className="my-1.5 border-gray-light" />

      {/* 集合場所（タップで展開） */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between py-1 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-0.5 text-sm text-text-black">
          <MdLocationOn size={16} />
          {data.place}
        </span>
        <MdExpandMore
          size={20}
          className={clsx("text-text-black transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div>
          <Section title="【集合場所】" lines={[data.place]} />
          <div className="py-2">
            <p className="text-xs font-bold text-text-black">【マニュアル】</p>
            <div className="mt-1">
              {hasUrl ? (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs leading-relaxed text-link"
                >
                  {data.url}
                </a>
              ) : (
                <p className="text-xs leading-relaxed text-text-black">
                  マニュアルがありません
                </p>
              )}
            </div>
          </div>
          <Section title="【困った時は】" lines={TROUBLE_GUIDE} />
          <Section
            title="【担当者の一覧】"
            lines={data.shiftMembers.map(formatGroup)}
          />
          <Section
            title="【前の時間の担当者の一覧】"
            lines={[
              data.beforeMembers.members.length > 0
                ? formatGroup(data.beforeMembers)
                : "前の時間の担当者はいません",
            ]}
          />
          <Section
            title="【次の時間の担当者の一覧】"
            lines={[
              data.afterMembers.members.length > 0
                ? formatGroup(data.afterMembers)
                : "次の時間の担当者はいません",
            ]}
          />
        </div>
      )}
    </div>
  );
}

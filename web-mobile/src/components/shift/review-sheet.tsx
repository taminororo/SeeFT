"use client";

import { useState } from "react";
import { MdStar, MdStarBorder } from "react-icons/md";
import { postReview } from "@/lib/api/reviews";
import { markReviewed } from "@/lib/shift/reviewed-store";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

// Flutter 版 `review_bottom_sheet.dart` の移植。
// 終了済み・未レビューのシフトに対しレビュー（人数評価・マニュアル評価・コメント）を促す。

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex justify-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-1"
          aria-label={`${n}つ星`}
        >
          {n <= value ? (
            <MdStar size={32} className="text-amber-400" />
          ) : (
            <MdStarBorder size={32} className="text-gray-light" />
          )}
        </button>
      ))}
    </div>
  );
}

export function ReviewSheet({
  taskName,
  userID,
  onClose,
}: {
  taskName: string;
  userID: number;
  onClose: () => void;
}) {
  const [staffingRating, setStaffingRating] = useState(3);
  const [manualRating, setManualRating] = useState(3);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    setIsFailed(false);
    try {
      await postReview({ userID, taskName, staffingRating, manualRating, comment });
      markReviewed(taskName);
      onClose();
    } catch {
      setIsSubmitting(false);
      setIsFailed(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20">
      <div className="flex w-full max-w-md flex-col gap-2 rounded-t-2xl bg-base p-8">
        <p className="font-bold text-md text-text-black">
          シフトのレビュー: {taskName}
        </p>
        <hr className="border-gray-light" />

        <p className="text-md text-text-black">シフトの人数は適切でしたか？</p>
        <StarRow value={staffingRating} onChange={setStaffingRating} />

        <p className="mt-2 text-md text-text-black">
          マニュアルは分かりやすかったですか？
        </p>
        <StarRow value={manualRating} onChange={setManualRating} />

        <p className="mt-2 text-md text-text-black">他にもあれば教えてください。</p>
        <TextField
          placeholder="例：マニュアルが分かりやすくて良かった"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {isFailed && (
          <p className="text-sm text-error">
            送信に失敗しました。もう一度お試しください。
          </p>
        )}

        <div className="mt-2 flex gap-2">
          <Button variant="outline" isExpanded onClick={onClose} disabled={isSubmitting}>
            スキップ
          </Button>
          <Button isExpanded onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "送信中..." : "送信"}
          </Button>
        </div>
      </div>
    </div>
  );
}

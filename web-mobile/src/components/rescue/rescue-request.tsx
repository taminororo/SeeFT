"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MdArrowForwardIos,
  MdError,
  MdHelpOutline,
  MdNoAccounts,
  MdOutlineCancel,
  MdWarning,
} from "react-icons/md";
import { config } from "@/lib/config";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  getRescueTasks,
  postQuestionRescue,
  postShorthandedRescue,
  postTroubleRescue,
  type RescueTask,
} from "@/lib/api/rescues";

// Flutter 版 `rescue_request_tab/` の移植（ネスト Navigator をステートマシンで再現）。
// home → 種類選択 → トラブル / 質問 / 人が来ない の各フォーム。

type Step = "home" | "select" | "trouble" | "question" | "shorthanded";

export function RescueRequest() {
  const [step, setStep] = useState<Step>("home");
  const toHome = () => setStep("home");
  const toSelect = () => setStep("select");

  switch (step) {
    case "home":
      return <Home onStart={toSelect} />;
    case "select":
      return <SelectType onPick={setStep} onBack={toHome} />;
    case "trouble":
      return <TroubleForm onDone={toHome} onBack={toSelect} />;
    case "question":
      return <QuestionForm onDone={toHome} onBack={toSelect} />;
    case "shorthanded":
      return <ShorthandedForm onDone={toHome} onBack={toSelect} />;
  }
}

// ===== ホーム =====
function Home({ onStart }: { onStart: () => void }) {
  const phone = config.chairpersonPhoneNumber.replace(
    /(\d{3})(\d{4})(\d{4})/,
    "$1-$2-$3",
  );
  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
      <p className="text-center text-sm text-gray-dark">
        送信したレスキューの対応状況は
        <br />
        「本部からの返答」タブで確認できます
      </p>

      {/* 困った時 */}
      <div className="flex flex-col items-center gap-4 rounded-normal bg-[#d4eae8] p-2">
        <p className="text-lg font-bold text-main">【困った時】</p>
        <p className="px-2 text-md text-text-black">
          <span className="font-bold underline">
            現場やマニュアルでは対応できないこと
          </span>
          があった場合は、以下の「レスキューを送信する」ボタンから本部へ連絡して指示を仰いでください。
        </p>
        <Button isExpanded onClick={onStart}>
          レスキューを送信する
        </Button>
      </div>

      {/* 緊急時 */}
      <div className="flex flex-col items-center gap-4 rounded-normal bg-[#ffdada] p-2">
        <p className="text-lg font-bold text-error">【緊急時】</p>
        <div className="flex items-start gap-2 px-2">
          <MdError size={24} className="shrink-0 text-error" />
          <p className="text-md text-error">
            <span className="font-bold underline">事件や事故（人が倒れた等）</span>
            の場合は、「レスキューを送信する」ボタンではなく、電話またはトランシーバーで本部に直接連絡してください。
            <br />
            本部の電話番号は以下の通りです。
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-2 rounded-normal border border-error bg-[#ffdada] p-2">
          <p className="text-center text-md text-error">
            {config.chairpersonName}
            <br />
            {phone}
          </p>
          <a
            href={`tel:${config.chairpersonPhoneNumber}`}
            className="rounded-pill bg-error px-6 py-2.5 text-sm text-text-white"
          >
            電話を掛ける
          </a>
        </div>
      </div>
    </div>
  );
}

// ===== 種類選択 =====
const TYPES = [
  {
    id: "trouble" as const,
    text: "トラブル",
    explanation: "例：物品がない等",
    Icon: MdOutlineCancel,
  },
  {
    id: "question" as const,
    text: "質問",
    explanation: "例：マニュアルで不明な箇所がある等",
    Icon: MdHelpOutline,
  },
  {
    id: "shorthanded" as const,
    text: "人が来ない",
    explanation: "例：〇〇のタスクで人が来ない",
    Icon: MdNoAccounts,
  },
];

function SelectType({
  onPick,
  onBack,
}: {
  onPick: (step: Step) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-8">
        <p className="mb-6 font-bold text-md text-text-black">
          発生した問題の種類を選択してください
        </p>
        <ul className="divide-y divide-gray-light">
          {TYPES.map(({ id, text, explanation, Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPick(id)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <Icon size={24} className="shrink-0 text-main" />
                <span className="flex-1">
                  <span className="block font-bold text-md text-text-black">
                    {text}
                  </span>
                  <span className="block text-sm text-gray-dark">
                    {explanation}
                  </span>
                </span>
                <MdArrowForwardIos size={16} className="text-gray-dark" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <hr className="border-gray-light" />
      <div className="p-4">
        <Button variant="outline" isExpanded onClick={onBack}>
          戻る
        </Button>
      </div>
    </div>
  );
}

// ===== フォーム共通の足場 =====
function FormShell({
  title,
  children,
  onSubmit,
  onBack,
  isSending,
}: {
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  onBack: () => void;
  isSending: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-8">
        <h2 className="mb-4 text-center font-bold text-lg text-text-black">
          {title}
        </h2>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
      <hr className="border-gray-light" />
      <div className="flex flex-col gap-2 p-4">
        <Button isExpanded onClick={onSubmit} disabled={isSending}>
          {isSending ? "送信中..." : "送信"}
        </Button>
        <Button variant="outline" isExpanded onClick={onBack} disabled={isSending}>
          戻る
        </Button>
      </div>
    </div>
  );
}

// タスク取得の loading / error をフォーム全体で切り替えるゲート。
function TaskGate({
  placeholder,
  onBack,
  children,
}: {
  placeholder: RescueTask;
  onBack: () => void;
  children: (options: RescueTask[]) => React.ReactNode;
}) {
  const { userID } = useAuth();
  const { data, isPending, isError } = useQuery({
    queryKey: ["rescueTasks", userID],
    queryFn: () => getRescueTasks(userID),
    enabled: userID !== 0,
  });

  if (isPending) {
    return (
      <GateMessage onBack={onBack}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-light border-t-main" />
        <p className="text-md text-gray-dark">読み込み中です。</p>
      </GateMessage>
    );
  }
  if (isError) {
    return (
      <GateMessage onBack={onBack}>
        <MdWarning size={48} className="text-gray-light" />
        <p className="whitespace-pre-line text-md text-gray-dark">
          {"データの取得に失敗しました。\nネットワーク接続を確認してやり直してください。"}
        </p>
      </GateMessage>
    );
  }
  // id 1, 2 を除外し、先頭にプレースホルダを置く。
  const options = [placeholder, ...data.filter((t) => t.id !== 1 && t.id !== 2)];
  return <>{children(options)}</>;
}

function GateMessage({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        {children}
      </div>
      <hr className="border-gray-light" />
      <div className="p-4">
        <Button variant="outline" isExpanded onClick={onBack}>
          戻る
        </Button>
      </div>
    </div>
  );
}

function TaskSelect({
  options,
  value,
  onChange,
}: {
  options: RescueTask[];
  value: number;
  onChange: (id: number) => void;
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-normal border border-gray-dark bg-white px-2 py-2 text-md text-text-black"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.taskName}
        </option>
      ))}
    </select>
  );
}

// ===== トラブル =====
function TroubleForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { userID } = useAuth();
  const [taskId, setTaskId] = useState(0); // 既定: タスク外(0)
  const [place, setPlace] = useState("");
  const [detail, setDetail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async () => {
    if (detail === "" || place === "") {
      toast.error("データが入力されていません");
      return;
    }
    setIsSending(true);
    try {
      // id 0（タスク外）は実 id 3 で送信する。
      await postTroubleRescue(userID, taskId !== 0 ? taskId : 3, place, detail);
      toast.success("レスキューを送信しました");
      onDone();
    } catch {
      toast.error("レスキューの送信に失敗しました");
      setIsSending(false);
    }
  };

  return (
    <TaskGate placeholder={{ id: 0, taskName: "タスク外" }} onBack={onBack}>
      {(options) => (
        <FormShell title="トラブル" onSubmit={submit} onBack={onBack} isSending={isSending}>
          <p className="text-md text-text-black">どのタスクですか？</p>
          <TaskSelect options={options} value={taskId} onChange={setTaskId} />
          <p className="mt-4 text-md text-text-black">発生場所はどこですか？</p>
          <TextField
            label="発生場所"
            placeholder="例：案内所 講義棟"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
          <p className="mt-4 text-md text-text-black">
            トラブルの詳細を記入してください
          </p>
          <TextField
            label="詳細"
            placeholder="例：〇〇の物品がない"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </FormShell>
      )}
    </TaskGate>
  );
}

// ===== 質問 =====
function QuestionForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { userID } = useAuth();
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async () => {
    if (question === "") {
      toast.error("質問内容が入力されていません");
      return;
    }
    setIsSending(true);
    try {
      await postQuestionRescue(userID, question);
      toast.success("レスキューを送信しました");
      onDone();
    } catch {
      toast.error("レスキューの送信に失敗しました");
      setIsSending(false);
    }
  };

  return (
    <FormShell title="質問" onSubmit={submit} onBack={onBack} isSending={isSending}>
      <p className="text-center text-md text-text-black">
        以下に質問内容を記入してください。
        <br />
        「送信」ボタンを押すと本部に送信されます。
      </p>
      <TextField
        label="質問"
        placeholder="例：〇〇のタスクの〇〇が分からないです"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
    </FormShell>
  );
}

// ===== 人が来ない =====
function ShorthandedForm({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const { userID } = useAuth();
  const [taskId, setTaskId] = useState(0); // 既定: 未選択(0)
  const [missingNumber, setMissingNumber] = useState("");
  const [place, setPlace] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async () => {
    const n = Number.parseInt(missingNumber, 10) || 0;
    if (n === 0 || place === "") {
      toast.error("データが入力されていません");
      return;
    }
    if (taskId === 0) {
      toast.error("タスクを選択してください");
      return;
    }
    setIsSending(true);
    try {
      await postShorthandedRescue(userID, taskId, n, place);
      toast.success("レスキューを送信しました");
      onDone();
    } catch {
      toast.error("レスキューの送信に失敗しました");
      setIsSending(false);
    }
  };

  return (
    <TaskGate
      placeholder={{ id: 0, taskName: "タスクを選択してください" }}
      onBack={onBack}
    >
      {(options) => (
        <FormShell
          title="人が来ない"
          onSubmit={submit}
          onBack={onBack}
          isSending={isSending}
        >
          <p className="text-md text-text-black">人が来ないのはどのタスクですか？</p>
          <TaskSelect options={options} value={taskId} onChange={setTaskId} />
          <p className="mt-4 text-md text-text-black">来ていないのは何人ですか？</p>
          <TextField
            label="人数"
            placeholder="例：2"
            inputMode="numeric"
            value={missingNumber}
            onChange={(e) =>
              setMissingNumber(e.target.value.replace(/[^0-9]/g, ""))
            }
          />
          <p className="mt-4 text-md text-text-black">
            どこに人を送れば良いですか？
          </p>
          <TextField
            label="送り先の場所"
            placeholder="例：案内所 講義棟"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        </FormShell>
      )}
    </TaskGate>
  );
}

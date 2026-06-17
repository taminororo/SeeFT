import { z } from "zod";
import { apiGetList, apiPost } from "./client";

// レスキュー API。Flutter 版 `api.dart` の rescue 系 + `models/rescue.dart` の移植。

// ===== 返答（GET）=====
// レスポンスは type で判別する多態。discriminatedUnion のメンバーは transform を
// 含まないプレーン Object にし、camelCase 変換は toCamel で行う。

const troubleRaw = z.object({
  type: z.literal("trouble"),
  id: z.number(),
  user_name: z.string().nullish(),
  time: z.string().nullish(),
  status: z.string().nullish(),
  response: z.string().nullish(),
  content: z.object({
    task: z.string().nullish(),
    place: z.string().nullish(),
    detail: z.string().nullish(),
  }),
});

const questionRaw = z.object({
  type: z.literal("question"),
  id: z.number(),
  user_name: z.string().nullish(),
  time: z.string().nullish(),
  status: z.string().nullish(),
  response: z.string().nullish(),
  content: z.object({ question: z.string().nullish() }),
});

const shorthandedRaw = z.object({
  type: z.literal("shorthanded"),
  id: z.number(),
  user_name: z.string().nullish(),
  time: z.string().nullish(),
  status: z.string().nullish(),
  response: z.string().nullish(),
  content: z.object({
    task: z.string().nullish(),
    missing_number: z.number().nullish(),
    place: z.string().nullish(),
  }),
});

const RescueResponseRawSchema = z.discriminatedUnion("type", [
  troubleRaw,
  questionRaw,
  shorthandedRaw,
]);

type RescueResponseRaw = z.infer<typeof RescueResponseRawSchema>;

// camelCase かつ null をフォールバックした表示用の型。
export type RescueResponse =
  | {
      type: "trouble";
      id: number;
      userName: string;
      time: string;
      status: string;
      response: string;
      content: { task: string; place: string; detail: string };
    }
  | {
      type: "question";
      id: number;
      userName: string;
      time: string;
      status: string;
      response: string;
      content: { question: string };
    }
  | {
      type: "shorthanded";
      id: number;
      userName: string;
      time: string;
      status: string;
      response: string;
      content: { task: string; missingNumber: number; place: string };
    };

const s = (v: string | null | undefined): string => v ?? "";

function toCamel(raw: RescueResponseRaw): RescueResponse {
  const base = {
    id: raw.id,
    userName: s(raw.user_name),
    time: s(raw.time),
    status: s(raw.status),
    response: s(raw.response),
  };
  switch (raw.type) {
    case "trouble":
      return {
        type: "trouble",
        ...base,
        content: {
          task: s(raw.content.task),
          place: s(raw.content.place),
          detail: s(raw.content.detail),
        },
      };
    case "question":
      return {
        type: "question",
        ...base,
        content: { question: s(raw.content.question) },
      };
    case "shorthanded":
      return {
        type: "shorthanded",
        ...base,
        content: {
          task: s(raw.content.task),
          missingNumber: raw.content.missing_number ?? 0,
          place: s(raw.content.place),
        },
      };
  }
}

// my: GET /rescues/users/:id、all: GET /rescues。空のとき null を返すため apiGetList で吸収。
export async function getMyRescueResponses(userID: number): Promise<RescueResponse[]> {
  const raw = await apiGetList(`/rescues/users/${userID}`, RescueResponseRawSchema);
  return raw.map(toCamel);
}

export async function getAllRescueResponses(): Promise<RescueResponse[]> {
  const raw = await apiGetList("/rescues", RescueResponseRawSchema);
  return raw.map(toCamel);
}

// ===== 送信（POST）=====
// いずれも POST /rescues に discriminated body を送る。成功時 201。

export async function postTroubleRescue(
  userID: number,
  taskID: number,
  place: string,
  detail: string,
): Promise<void> {
  await apiPost("/rescues", {
    type: "trouble",
    user_id: userID,
    content: { task_id: taskID, place, detail },
  });
}

export async function postQuestionRescue(
  userID: number,
  question: string,
): Promise<void> {
  await apiPost("/rescues", {
    type: "question",
    user_id: userID,
    content: { question },
  });
}

export async function postShorthandedRescue(
  userID: number,
  taskID: number,
  missingNumber: number,
  place: string,
): Promise<void> {
  await apiPost("/rescues", {
    type: "shorthanded",
    user_id: userID,
    content: { task_id: taskID, missing_number: missingNumber, place },
  });
}

// ===== タスク一覧（送信フォームのドロップダウン用）=====
// GET /tasks/users/:id → [{ id, task }]。空のとき null を返す。
// API のフィールド名は `task`。Flutter 同様 taskName に正規化する。
const RescueTaskSchema = z
  .object({
    id: z.number(),
    task: z.string().nullish(),
  })
  .transform((t) => ({ id: t.id, taskName: t.task ?? "" }));

export type RescueTask = { id: number; taskName: string };

export async function getRescueTasks(userID: number): Promise<RescueTask[]> {
  return apiGetList(`/tasks/users/${userID}`, RescueTaskSchema);
}

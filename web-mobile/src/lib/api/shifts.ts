import { z } from "zod";
import { apiGetList } from "./client";

// GET /shift-cards/users/:user_id/dates/:date_id/weathers/:weather_id
// Flutter 版 `api.getShiftCardsByUserAndDateAndWeather` / `models/shift_card.dart` の移植。
// レスポンスは snake_case。境界で camelCase の型へ変換し、null はフォールバックする
// （before_members/after_members が null の場合の 'データの取得に失敗しました' を踏襲）。

const ShiftMemberSchema = z
  .object({
    name: z.string().nullish(),
    grade: z.string().nullish(),
    bureau: z.string().nullish(),
  })
  .transform((m) => ({
    name: m.name ?? "データの取得に失敗しました",
    grade: m.grade ?? "",
    bureau: m.bureau ?? "",
  }));

const ShiftMembersSchema = z
  .object({
    s_time: z.string().nullish(),
    e_time: z.string().nullish(),
    members: z.array(ShiftMemberSchema).nullish(),
  })
  .transform((g) => ({
    sTime: g.s_time ?? "",
    eTime: g.e_time ?? "",
    members: g.members ?? [],
  }));

const EMPTY_GROUP: ShiftMembersGroup = { sTime: "", eTime: "", members: [] };

const ShiftCardSchema = z
  .object({
    task_name: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    place: z.string(),
    url: z.string(),
    shift_members: z.array(ShiftMembersSchema).nullish(),
    before_members: ShiftMembersSchema.nullish(),
    after_members: ShiftMembersSchema.nullish(),
  })
  .transform((c) => ({
    taskName: c.task_name,
    startTime: c.start_time,
    endTime: c.end_time,
    place: c.place,
    url: c.url,
    shiftMembers: c.shift_members ?? [],
    beforeMembers: c.before_members ?? EMPTY_GROUP,
    afterMembers: c.after_members ?? EMPTY_GROUP,
  }));

export type ShiftMember = z.infer<typeof ShiftMemberSchema>;
export type ShiftMembersGroup = z.infer<typeof ShiftMembersSchema>;
export type ShiftCard = z.infer<typeof ShiftCardSchema>;

export async function getShiftCards(
  userID: number,
  dayID: number,
  weatherID: number,
): Promise<ShiftCard[]> {
  return apiGetList(
    `/shift-cards/users/${userID}/dates/${dayID}/weathers/${weatherID}`,
    ShiftCardSchema,
  );
}

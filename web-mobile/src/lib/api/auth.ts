import { z } from "zod";
import { apiPostRaw } from "./client";

// Flutter 版 `api.signIn` の移植。
// POST /mail_auth/signin?student_number=X&password=Y （ボディ無し、資格情報はクエリ）。
// レスポンスは { id, roleID }。id があれば成功、無ければ失敗（現 Flutter と同じ判定）。
// 現 Flutter 版はステータスを見ずに decode するため、ここでも safeParse で寛容に扱う。

const SignInResponseSchema = z.object({
  id: z.number().nullish(),
  roleID: z.number().nullish(),
});

export type SignedInUser = { id: number; roleID: number };

export async function signIn(
  studentNumber: string,
  password: string,
): Promise<SignedInUser | null> {
  const path = `/mail_auth/signin?student_number=${encodeURIComponent(
    studentNumber,
  )}&password=${encodeURIComponent(password)}`;

  const json = await apiPostRaw(path);
  const parsed = SignInResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.id == null) {
    return null;
  }
  return { id: parsed.data.id, roleID: parsed.data.roleID ?? 0 };
}

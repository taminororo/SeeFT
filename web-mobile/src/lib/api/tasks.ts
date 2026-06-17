import { z } from "zod";
import { apiGetList } from "./client";

// GET /tasks → マニュアル一覧。Flutter 版 `api.getAllManual`。
// 実レスポンスは多数フィールドを持つが、ManualListPage が使うのは task と url のみ。
// Zod は余剰キーを strip するため、必要フィールドだけ宣言すればよい。
const ManualSchema = z.object({
  task: z.string(),
  url: z.string(),
});

export type Manual = z.infer<typeof ManualSchema>;

export async function getManuals(): Promise<Manual[]> {
  return apiGetList("/tasks", ManualSchema);
}

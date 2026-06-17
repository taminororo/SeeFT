import { z } from "zod";
import { apiGet } from "./client";

// GET /tasks → マニュアル一覧。Flutter 版 `api.getAllManual`。
// ManualListPage は各要素の task（タスク名）と url（外部マニュアル）を使う。
const ManualSchema = z.object({
  task: z.string(),
  url: z.string(),
});

export type Manual = z.infer<typeof ManualSchema>;

const ManualListSchema = z.array(ManualSchema);

export async function getManuals(): Promise<Manual[]> {
  return apiGet("/tasks", ManualListSchema);
}

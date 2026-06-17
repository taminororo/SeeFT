import { apiPost } from "./client";

// POST /reviews。Flutter 版 `api.postReview`。成功時 201。レスポンスは使わない。
export async function postReview(input: {
  userID: number;
  taskName: string;
  staffingRating: number;
  manualRating: number;
  comment: string;
}): Promise<void> {
  await apiPost("/reviews", {
    user_id: input.userID,
    task_name: input.taskName,
    staffing_rating: input.staffingRating,
    manual_rating: input.manualRating,
    comment: input.comment,
  });
}

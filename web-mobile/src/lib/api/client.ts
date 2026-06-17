// API クライアント基盤。Flutter 版 `mobile/lib/utils/api.dart` の `get` / `post` を移植。
// Go API（Echo）の契約はそのまま踏襲する: GET は成功時 200、POST は成功時 201。
// Flutter 版に無かったエラーハンドリングと Zod 境界検証を追加している。

import { z } from "zod";
import { config } from "@/lib/config";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function toUrl(path: string): string {
  return path.startsWith("http") ? path : `${config.apiBaseUrl}${path}`;
}

// 現 Flutter 版が送っているヘッダを踏襲（Content-Type のみ実質的に意味を持つ）。
const JSON_HEADERS: HeadersInit = { "Content-Type": "application/json" };

/** GET。Go API は成功時 200 を返す。レスポンスを Zod スキーマで検証する。 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<z.infer<S>> {
  const res = await fetch(toUrl(path), { headers: JSON_HEADERS });
  if (res.status !== 200) {
    throw new ApiError(res.status, `GET ${path} に失敗しました (status: ${res.status})`);
  }
  return schema.parse(await res.json());
}

/**
 * POST。Go API は成功時 201 を返す（rescue / review）。
 * schema を渡すとレスポンスを検証して返す。省略時は生の JSON を返す。
 */
export async function apiPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.infer<S>>;
export async function apiPost(path: string, body: unknown): Promise<unknown>;
export async function apiPost(
  path: string,
  body: unknown,
  schema?: z.ZodType,
): Promise<unknown> {
  const res = await fetch(toUrl(path), {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new ApiError(res.status, `POST ${path} に失敗しました (status: ${res.status})`);
  }
  const json = await res.json();
  return schema ? schema.parse(json) : json;
}

/**
 * 認証専用の生 POST。ボディ無し・ステータス検証なしで JSON をそのまま返す。
 * 現 Flutter 版 `api.signIn` の「ステータスを見ず json.decode するだけ」の挙動を踏襲。
 */
export async function apiPostRaw(path: string): Promise<unknown> {
  const res = await fetch(toUrl(path), { method: "POST", headers: JSON_HEADERS });
  return res.json();
}

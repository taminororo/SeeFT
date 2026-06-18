# 本番カットオーバー Runbook: Flutter-web mobile → Next.js web-mobile

mobile クライアントを Flutter-web（`mobile/`、python 静的配信）から Next.js
（`web-mobile/`、standalone）へ本番で差し替えるための手順書。対象は
`docker-compose.prod.yml` の `mobile` サービス 1 ブロックの置き換えである。

---

## 1. 目的と前提

### 完全な挙動同一性は証明できない、という前提

旧クライアント（Flutter-web）と新クライアント（Next.js）は描画エンジンも
ルーティングもネットワーク層の実装も別物であり、「すべての画面・すべての
入力・すべての回線条件で挙動が完全に一致すること」を事前に証明することは
原理的にできない。E2E と手動 smoke でカバーできるのは主要フローまでで、
レアケースやブラウザ差・回線断のタイミング差まで網羅しきることはできない。

したがってこの Runbook の目標は「完全一致の証明」ではなく、
**十分な確信（enough confidence）を積み上げたうえで、何かあれば即座に
切り戻せる状態（instant rollback）を常に確保しておくこと** に置く。
ラダー（第 3 章）はこの 2 点 — 確信の積み上げと、いつでも 30 秒で戻せる
退路 — を両立させるために段を分けている。

### OPS チームが持つべき前提条件

この fork に含まれていない、OPS（運用）側が所有・準備する前提:

- **cloudflare tunnel の設定と資格情報**。`docker-compose.prod.yml` の
  `cloudflare` サービスは `volumes: ["./web/prod:/home/nonroot/.cloudflared"]`
  で `./web/prod` をマウントし `command: tunnel run` を実行する。この
  `web/prod/`（tunnel の config と credentials）はこの fork には存在せず、
  OPS 所有。カットオーバーで `mobile` サービスの公開ポートを 45029 のまま
  維持する限り tunnel 設定は無変更で済むが、カナリア用に別ホスト名を生やす
  場合（第 3 章 b）は OPS による ingress / DNS 追加が必須。
- **DB マイグレーション互換性**。新クライアントが叩く API は
  `docker-compose.prod.yml` の `api` サービス（`nutfes-seeft-api`,
  `ports: ["1234:1234"]`）であり、mobile 置き換えでは API も DB も触らない。
  ただし新旧クライアントは同一 API・同一スキーマを前提に動くため、
  カットオーバー時点で API/DB が両クライアント互換であることを OPS が保証
  していること。mobile の入れ替えと DB マイグレーションは同じ窓で同時に
  実施しない（切り分け不能になるため）。

---

## 2. 資材確認

カットオーバー前に、新クライアント側の資材が「mobile サービスの drop-in
置き換え」として成立していることを確認する。

### 本番イメージは 45029 を listen する → mobile の差し替えが成立する

- `web-mobile/Dockerfile` は multi-stage（`deps` → `builder` → `runner`）で、
  runner ステージに次がある:

  ```dockerfile
  ENV PORT=45029
  EXPOSE 45029
  CMD ["node", "server.js"]
  ```

  つまり Next.js standalone サーバが **45029** を listen する。これは旧
  `mobile/python/server.py` の `PORT = 45029`（`./build/web` を配信）と
  同じポートであり、`docker-compose.prod.yml` の `ports: ["45029:45029"]`
  を据え置けば cloudflare tunnel から見たエンドポイントは変わらない。
- `web-mobile/next.config.ts` は `output: "standalone"` を設定済みで、
  Dockerfile runner が `.next/standalone` / `.next/static` / `public` を
  コピーして `node server.js` で起動する構成と一致している。資材として
  ビルド可能・起動可能な状態にある。

### NEXT_PUBLIC_* はビルド時に焼き込まれる（list）

`web-mobile/src/lib/config.ts` は値を `process.env.NEXT_PUBLIC_*` から取得し、
Next の仕様上これらは **ビルド時にバンドルへ埋め込まれる**。実行時に compose
の `environment:` で渡しても反映されない（`web-mobile/Dockerfile` 冒頭の
コメントも同旨）。本番値が必要なものはイメージ build 時に `--build-arg` /
`ENV` で渡すこと。config.ts が参照するキーは以下:

- `NEXT_PUBLIC_API_BASE_URL`（デフォルト `http://localhost:1234`。
  Dockerfile では ARG デフォルト `https://seeft-api.nutfes.net`）
- `NEXT_PUBLIC_CHAIRPERSON_NAME`（デフォルト `委員長`）
- `NEXT_PUBLIC_CHAIRPERSON_PHONE_NUMBER`（デフォルト `00011112222`）
- `NEXT_PUBLIC_SEEFT_INSTRUCTIONS_URL`（デフォルト `https://example.com`）
- `NEXT_PUBLIC_WHOLE_SHIFT_URL`（デフォルト `https://example.com`）
- `NEXT_PUBLIC_NUTFES_PREPARATION_DAY`（デフォルト `2025-09-12`）
- `NEXT_PUBLIC_NUTFES_DAY1`（デフォルト `2025-09-13`）
- `NEXT_PUBLIC_NUTFES_DAY2`（デフォルト `2025-09-14`）
- `NEXT_PUBLIC_NUTFES_TIDYING_UP_DAY`（デフォルト `2025-09-15`）

なお `docker-compose.prod.yml` の `mobile` サービスは現状
`NEXT_PUBLIC_APP_ENV: "production"` を実行時環境に渡しているが、上記の通り
クライアント設定は build 時確定なので、`apiBaseUrl` 等の本番値は **build 時**
に確定させておくこと（デフォルトの `localhost:1234` / `example.com` のまま
本番イメージを焼かない）。

---

## 3. ラダー（5 段）

確信を積み上げつつ、各段で退路を保持する。

### (a) 旧 Flutter イメージのビルド & バックアップタグ取得

切り戻し先となる現行イメージを先に確保する。

```bash
# 現行 prod 構成をビルド（Makefile: prod-build）
make prod-build
# = docker compose -f docker-compose.prod.yml build

# 現在動いている mobile（Flutter+python）イメージにバックアップタグを打つ
docker tag $(docker compose -f docker-compose.prod.yml images -q mobile) \
  nutfes-seeft-mobile:flutter-backup-$(date +%Y%m%d)
```

このバックアップタグは (d) の即時ロールバックで「再ビルド不要の最速の戻し先」
として使う。`mobile/` ディレクトリ（Flutter ソース）も削除せず insurance
として残す。

### (b)【任意】並走 / カナリア

本番トラフィックを一切動かさず、本番候補イメージを別ホスト名で並走させて
確信を上積みする任意ステップ。

- example override `docs/cutover/docker-compose.canary.yml` を重ねて
  `web-mobile-canary`（`container_name: nutfes-seeft-web-mobile-canary`,
  `ports: ["45030:45029"]`, `depends_on: ["api"]`）を立てる。
- cloudflare tunnel 側に `seeft-canary` 系のホスト名 + DNS を OPS が追加し、
  ingress を `http://web-mobile-canary:45029` へ向ける。
- **primary（Flutter の `mobile`, 45029）は据え置き、本番は Flutter のまま**。
  カナリアで第 3 章 (e) の smoke を一通り通し、確信が積み上がってから (c) へ。

```bash
docker compose \
  -f docker-compose.prod.yml \
  -f docs/cutover/docker-compose.canary.yml \
  up -d web-mobile-canary
```

（`docs/cutover/docker-compose.canary.yml` は example。ライブ compose には
未接続。本番ホストでホスト名 / DNS / build-arg を整えたうえで使う。）

### (c) カットオーバー（技大祭 3 日間の窓を外して実施）

実施タイミングは第 4 章を厳守（技大祭本番 3 日間とその前後は避ける）。
`docker-compose.prod.yml` の `mobile` サービス **1 ブロックだけ** を書き換える。
差分は次の通り（左=現行 Flutter / 右=新 Next.js）:

```diff
   mobile:
-    build: "./mobile"
+    build: "./web-mobile"
     container_name: "nutfes-seeft-mobile"
-    volumes: ["./mobile:/app"]
-    command: "python3 ./python/server.py"
+    command: "node server.js"
     ports: ["45029:45029"]
     environment:
       NEXT_PUBLIC_APP_ENV: "production"
     depends_on: ["api"]
```

変更の要点:

- `build: "./mobile"` → `build: "./web-mobile"`（Flutter+python →
  Next standalone イメージ）。
- `command: "python3 ./python/server.py"` → `command: "node server.js"`
  （`web-mobile/Dockerfile` の CMD と同じ。明示しておくと意図が読み取れる）。
- `volumes: ["./mobile:/app"]` を **削除**。Flutter ソースのバインドマウントは
  Next の standalone イメージでは不要かつ有害（イメージ内 `/app` を上書きして
  `server.js` を覆い隠してしまう）。
- `container_name: "nutfes-seeft-mobile"` は **維持**。
- `ports: ["45029:45029"]` は **維持** → tunnel 設定は無変更。
- `depends_on: ["api"]` は維持。

適用:

```bash
make prod-build
make prod-up
# = docker compose -f docker-compose.prod.yml build
#   docker compose -f docker-compose.prod.yml up -d
```

> 注意: `make mobile-up`（`cd mobile && fvm flutter run ...`）は **旧 Flutter
> 開発用**であり本番カットオーバーでは使わない。本番は `prod-build` /
> `prod-up`（`docker-compose.prod.yml`）のみ。

### (d) 即時ロールバック（< 30 秒）

問題を検知したら即座に戻す。退路は 2 系統あり、どちらも 30 秒以内を狙う。

**系統 1: 該当 1 ブロックの git revert + 再ビルド + 再起動**

```bash
# (c) のコミット 1 個（mobile サービスブロックのみ）を取り消す
git revert --no-edit <cutover-commit>
make prod-build && make prod-up
```

**系統 2: バックアップ Flutter イメージへ retag（再ビルド不要・最速）**

```bash
# (a) で打ったバックアップタグへ戻す
docker tag nutfes-seeft-mobile:flutter-backup-YYYYMMDD nutfes-seeft-mobile:latest
docker compose -f docker-compose.prod.yml up -d mobile
```

`container_name` と `45029:45029` は不変なので、どちらの系統でも tunnel から
見たエンドポイントは変わらず、トラフィックは自動で旧クライアントに戻る。
`mobile/`（Flutter ソース）は insurance として削除しない。

### (e) モニタリング + 手動 smoke チェックリスト

カットオーバー直後、コア導線を実機で 1 周する。各画面のルートは
`web-mobile/src/app` 実体に対応。

- **ログイン**: `/sign-in` で実アカウントの学籍番号 + パスワードを入力し
  ログイン成功（`signIn(user.id, user.roleID)` 後に `(main)` へ遷移）。
- **マイシフト**: `/shifts` でシフトが表示される。日付タブ（準備日 / 1日目 /
  2日目）を切り替えられる。
- **New / レビュー**: 未開封シフトに New バッジが付く。終了済み・未レビューの
  シフトでレビューシート（`ReviewSheet`）が出て、レビュー送信できる。
- **レスキュー送信 / 返答**: `/rescue` の「レスキュー送信」タブで送信、
  「本部からの返答」タブで応答が見える。
- **マニュアル**: `/manuals` でタスク名一覧が出て、タップで外部マニュアル URL
  が開く。
- **ログアウト**: `/etc` の「ログアウト」で `signOut()` → `/sign-in` に戻る。

モニタリング: `docker compose -f docker-compose.prod.yml logs -f mobile` で
`node server.js` の起動ログとリクエストを確認、cloudflare tunnel 側の health /
ステータス（OPS 計器）で 45029 への到達と 5xx 率を監視する。異常があれば
(d) へ。

---

## 4. タイミング

- **早 9 月の技大祭本番（3 日間）とその準備日・撤収日は避ける**。
  プロジェクトの日程では技大祭は 9 月前半で、`config.ts` のデフォルトでも
  準備日 9/12・1日目 9/13・2日目 9/14・撤収日 9/15 が並ぶ（年により変動、
  本番は build 時に確定）。この窓は利用がピークで切り分けも難しいため、
  カットオーバー（c）もカナリア追加（b）も実施しない。
- 9 月は PM が海外、引き継ぎは 8 月開始。カットオーバーは
  **技大祭の十分前（理想は引き継ぎ前後で PM が国内にいる時期）に前倒し**で
  済ませ、本番期間中はクライアントを凍結する。万一に備え (d) の退路だけは
  期間中も維持する。
- 実施は利用の少ない時間帯（深夜帯など）に、(a) のバックアップ取得後に行う。

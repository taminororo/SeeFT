# SeeFT web-mobile 本番イメージ（Flutter+python の mobile サービスを置き換える想定）。
# Next を port 45029 で起動すれば cloudflare tunnel 設定は無変更で済む。
#
# 注意: NEXT_PUBLIC_* はビルド時にバンドルへ埋め込まれる。本番 URL 等はビルド時に
# ARG/ENV で渡す必要がある（実行時の環境変数では反映されない）。

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ビルド時に埋め込む公開設定（必要に応じて追加）。
ARG NEXT_PUBLIC_API_BASE_URL=https://seeft-api.nutfes.net
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=45029
# standalone 出力（next.config の output: "standalone"）。
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 45029
CMD ["node", "server.js"]

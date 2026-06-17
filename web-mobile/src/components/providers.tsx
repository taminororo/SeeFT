"use client";

// TanStack Query のプロバイダ。IndexedDB（idb-keyval）へキャッシュを永続化し、
// Flutter 版 Hive の「キャッシュ即表示 → バックグラウンド再検証」を再現する。

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { useState } from "react";
import { Toaster } from "sonner";

// 永続化を効かせるため gcTime を永続化期間まで延ばす（デフォルト 5 分だと
// IndexedDB に書く前に GC されてしまう）。
const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24; // 24 時間

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30 秒は fresh 扱い
        gcTime: PERSIST_MAX_AGE,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// idb-keyval を AsyncStorage インターフェースに適合させる。
const persister = createAsyncStoragePersister({
  key: "seeft-query-cache",
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
    >
      {children}
      <Toaster position="top-center" richColors />
    </PersistQueryClientProvider>
  );
}

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router-dom";
import { isUnauthorized } from "./api/client";
import { router } from "./router";
import { NovaVerze } from "./components/NovaVerze";
import { ToastProvider } from "./components/Toast";

export default function App() {
  const [queryClient] = useState(() => {
    // 401 kdekoli (reset kódu nebo vypnutí účtu odvolalo přihlášení, vypršelo)
    // → appka se odhlásí sama a RequireAuth pošle na přihlášení. Bez toho by
    // otevřená záložka jen ukazovala chyby až do ručního obnovení.
    const odhlasit = (err: unknown) => {
      if (isUnauthorized(err)) client.setQueryData(["me"], null);
    };
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError: odhlasit }),
      mutationCache: new MutationCache({ onError: odhlasit }),
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: 1,
          staleTime: 15_000,
        },
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
        <NovaVerze />
      </ToastProvider>
    </QueryClientProvider>
  );
}

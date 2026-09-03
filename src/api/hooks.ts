import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { KonfigProduct } from "@shared/konfigurator";
import type {
  ContactDetail,
  ContactRow,
  ItemRow,
  NotificationRow,
  NotifPref,
  OrderDetail,
  OrderListRow,
  OrderPhase,
  PhaseCounts,
  ProductTypeRow,
  SessionUser,
  StatsMonth,
  TodayData,
  UserRow,
} from "@shared/types";
import { api, isUnauthorized } from "./client";

// --- auth -------------------------------------------------------------------

export function useMe(): UseQueryResult<SessionUser | null> {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const { user } = await api<{ user: SessionUser }>("/api/me");
        return user;
      } catch (err) {
        if (isUnauthorized(err)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<{ user: SessionUser }>("/api/login", { method: "POST", body: { code } }),
    onSuccess: ({ user }) => {
      qc.setQueryData(["me"], user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  });
}

// --- kontakty ---------------------------------------------------------------

export function useContacts(search: string, filter: "vse" | "fresh") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (filter !== "vse") params.set("filter", filter);
  const qs = params.toString();
  return useQuery({
    queryKey: ["contacts", search, filter],
    queryFn: () => api<{ contacts: ContactRow[] }>(`/api/contacts${qs ? `?${qs}` : ""}`),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

/** Odznak v navigaci — počet kontaktů „ozvat se". */
export function useFreshCount() {
  return useQuery({
    queryKey: ["contacts", "fresh-count"],
    queryFn: () => api<{ count: number }>("/api/contacts/fresh-count"),
    staleTime: 30_000,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => api<ContactDetail>(`/api/contacts/${id}`),
    staleTime: 10_000,
  });
}

export function useInvalidateContacts() {
  const qc = useQueryClient();
  return async (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["contacts"] });
    void qc.invalidateQueries({ queryKey: ["today"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    if (id) await qc.invalidateQueries({ queryKey: ["contact", id] });
  };
}

// --- zakázky ----------------------------------------------------------------

export function useToday() {
  return useQuery({
    queryKey: ["today"],
    queryFn: () => api<TodayData>("/api/today"),
    staleTime: 15_000,
  });
}

export interface OverviewData {
  phase_counts: PhaseCounts;
  queue: (OrderListRow & { idle_days: number })[];
  fresh_contacts: number;
}

export function useOverview(enabled = true) {
  return useQuery({
    queryKey: ["overview"],
    queryFn: () => api<OverviewData>("/api/overview"),
    enabled,
    staleTime: 15_000,
  });
}

export function useOrders(search: string, filter: OrderPhase | "vse" | "archiv") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (filter !== "vse") params.set("filter", filter);
  const qs = params.toString();
  return useQuery({
    queryKey: ["orders", search, filter],
    queryFn: () => api<{ orders: OrderListRow[] }>(`/api/orders${qs ? `?${qs}` : ""}`),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => api<OrderDetail>(`/api/orders/${id}`),
    staleTime: 10_000,
  });
}

/**
 * Po zápisu je potřeba počkat na čerstvý detail — jinak by navazující
 * obrazovka (třeba formulář položky) rozhodovala podle starých dat v cache
 * a poslala technika zpátky na krok, který právě dokončil.
 */
export function useInvalidateOrder() {
  const qc = useQueryClient();
  return async (id: string) => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["today"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    await qc.invalidateQueries({ queryKey: ["order", id] });
  };
}

// --- notifikace ---------------------------------------------------------------

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{ notifications: NotificationRow[]; unread: number }>("/api/notifications"),
    staleTime: 20_000,
    // Zvonek se musí obnovit i po návratu do záložky a v záložce na pozadí —
    // jinak kancelář po přepnutí zpět kouká na dvě minuty starý odznak
    // a čerstvá zpráva se objeví „až za chvíli". Dotaz je levný (50 řádků).
    refetchInterval: 45_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) =>
      api<{ ok: true }>("/api/notifications/read", { method: "POST", body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useNotifPrefs(enabled = true) {
  return useQuery({
    queryKey: ["notif-prefs"],
    queryFn: () => api<{ prefs: NotifPref[] }>("/api/notif-prefs"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSetNotifPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pref: NotifPref) =>
      api<{ ok: true }>("/api/notif-prefs", { method: "PUT", body: pref }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-prefs"] }),
  });
}

// --- číselníky ---------------------------------------------------------------

export function useProductTypes() {
  return useQuery({
    queryKey: ["product-types"],
    queryFn: () => api<{ product_types: ProductTypeRow[] }>("/api/product-types"),
    staleTime: 10 * 60_000,
  });
}

/** Naměřené podklady dodavatele — schéma polí a pravidel jednoho produktu.
 *  Mění se jen s deployem, takže se drží v cache dlouho. */
export function useKonfigProduct(key: string | null | undefined) {
  return useQuery({
    queryKey: ["konfigurator", key],
    queryFn: () =>
      api<{ product: KonfigProduct }>(`/api/konfigurator/${encodeURIComponent(key!)}`),
    enabled: Boolean(key),
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  });
}

// --- kancelář -------------------------------------------------------------------

export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[] }>("/api/users"),
    enabled,
  });
}

export function useStatsMonth(month: string) {
  return useQuery({
    queryKey: ["stats", "month", month],
    queryFn: () => api<StatsMonth>(`/api/stats?month=${month}`),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ admin_group_email: string }>("/api/settings"),
    enabled,
  });
}

export type { ItemRow };

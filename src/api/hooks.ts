import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  ClientRow,
  DashboardCounts,
  ItemRow,
  OrderDetail,
  OrderListRow,
  OrderStatus,
  ProductTypeRow,
  SessionUser,
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
    mutationFn: (code: string) => api<{ user: SessionUser }>("/api/login", { method: "POST", body: { code } }),
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

// --- zakázky ----------------------------------------------------------------

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<{ counts: DashboardCounts }>("/api/dashboard"),
    staleTime: 15_000,
  });
}

export function useOrders(search: string, status: OrderStatus | "") {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery({
    queryKey: ["orders", search, status],
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

export function useInvalidateOrder() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: ["order", id] });
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

// --- číselníky ---------------------------------------------------------------

export function useProductTypes() {
  return useQuery({
    queryKey: ["product-types"],
    queryFn: () => api<{ product_types: ProductTypeRow[] }>("/api/product-types"),
    staleTime: 10 * 60_000,
  });
}

export function useClientSearch(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["clients", search],
    queryFn: () => api<{ clients: ClientRow[] }>(`/api/clients?search=${encodeURIComponent(search)}`),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// --- admin -------------------------------------------------------------------

export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[] }>("/api/users"),
    enabled,
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

import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "./api/hooks";
import { AppLayout } from "./components/AppLayout";
import { Spinner } from "./components/ui";
import AdminPage from "./pages/Admin";
import DashboardPage from "./pages/Dashboard";
import ItemFormPage from "./pages/ItemForm";
import LoginPage from "./pages/Login";
import OrderDetailPage from "./pages/OrderDetail";
import OrderNewPage from "./pages/OrderNew";
import OrdersPage from "./pages/Orders";
import StatsPage from "./pages/Stats";

function RequireAuth() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <div className="page-center">
        <Spinner />
      </div>
    );
  }
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function RequireAdmin() {
  const me = useMe();
  if (me.isPending) return null;
  if (me.data?.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      // Formulář položky běží fullscreen bez app hlavičky (krok „nové okno")
      { path: "/zakazky/:orderId/polozka/nova", element: <ItemFormPage mode="new" /> },
      { path: "/zakazky/:orderId/polozka/:itemId", element: <ItemFormPage mode="edit" /> },
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/zakazky", element: <OrdersPage /> },
          { path: "/zakazky/nova", element: <OrderNewPage /> },
          { path: "/zakazky/:orderId", element: <OrderDetailPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: "/admin", element: <AdminPage /> },
              { path: "/statistiky", element: <StatsPage /> },
            ],
          },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

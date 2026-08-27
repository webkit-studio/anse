import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "./api/hooks";
import { Shell, useOfficeView } from "./components/Shell";
import { Spinner } from "./components/ui";
import CenaPracePage from "./pages/CenaPrace";
import DnesPage from "./pages/Dnes";
import ItemFormPage from "./pages/ItemForm";
import KontaktDetailPage from "./pages/KontaktDetail";
import KontaktNovyPage from "./pages/KontaktNovy";
import KontaktyPage from "./pages/Kontakty";
import LoginPage from "./pages/Login";
import MontazPage from "./pages/Montaz";
import NastaveniPage from "./pages/Nastaveni";
import PrehledPage from "./pages/Prehled";
import StatistikyPage from "./pages/Statistiky";
import UdajeZakaznikaPage from "./pages/UdajeZakaznika";
import ZakazkaDetailPage from "./pages/ZakazkaDetail";
import ZakazkaDetailOfficePage from "./pages/ZakazkaDetailOffice";
import ZakazkyPage from "./pages/Zakazky";

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

function RequireOffice() {
  const me = useMe();
  if (me.isPending) return null;
  if (me.data?.role !== "kancelar") return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Domovská obrazovka: kancelář na desktopu má Přehled, jinak Dnes. */
function Home() {
  return useOfficeView() ? <PrehledPage /> : <DnesPage />;
}

/** Detail zakázky: kancelář na desktopu má fázový panel, technik terénní pohled. */
function OrderDetail() {
  return useOfficeView() ? <ZakazkaDetailOfficePage /> : <ZakazkaDetailPage />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: "/", element: <Home /> },

          { path: "/kontakty", element: <KontaktyPage /> },
          { path: "/kontakty/novy", element: <KontaktNovyPage /> },
          { path: "/kontakty/:contactId", element: <KontaktDetailPage /> },

          { path: "/zakazky", element: <ZakazkyPage /> },
          { path: "/zakazky/:orderId", element: <OrderDetail /> },
          { path: "/zakazky/:orderId/zakaznik", element: <UdajeZakaznikaPage /> },
          { path: "/zakazky/:orderId/cena", element: <CenaPracePage /> },
          { path: "/zakazky/:orderId/montaz", element: <MontazPage /> },
          { path: "/zakazky/:orderId/polozka/nova", element: <ItemFormPage mode="new" /> },
          { path: "/zakazky/:orderId/polozka/:itemId", element: <ItemFormPage mode="edit" /> },

          {
            element: <RequireOffice />,
            children: [
              { path: "/statistiky", element: <StatistikyPage /> },
              { path: "/nastaveni", element: <NastaveniPage /> },
              { path: "/nastaveni/:section", element: <NastaveniPage /> },
            ],
          },

          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

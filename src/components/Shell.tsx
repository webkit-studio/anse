import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { NOTIF_EVENTS } from "@shared/types";
import { ago } from "@shared/format";
import {
  useFreshCount,
  useLogout,
  useMarkNotificationsRead,
  useMe,
  useNotifPrefs,
  useNotifications,
  useSetNotifPref,
} from "../api/hooks";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";
import { Button, Spinner, Switch } from "./ui";

/** Kancelář má vlastní rozvržení od tabletu výš; na telefonu vidí totéž co
 *  technik (Marek jezdí zaměřovat — zadání §1).
 *  Práh je 768 px: na iPadu na výšku (820) musí kancelář dostat fázový panel
 *  a své akce — pod ním by nešlo nacenit, objednat ani vystavit montážní list. */
const OFFICE_MIN = "(min-width: 768px)";

export function useIsWide(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(OFFICE_MIN).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(OFFICE_MIN);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export function useOfficeView(): boolean {
  const me = useMe();
  const wide = useIsWide();
  return me.data?.role === "kancelar" && wide;
}

// --- notifikace ---------------------------------------------------------------

function NotifList({
  onOpen,
}: {
  onOpen: (n: { order_id: string | null; contact_id: string | null }) => void;
}) {
  const notifs = useNotifications();
  const markRead = useMarkNotificationsRead();
  const labels = new Map(NOTIF_EVENTS.map((e) => [e.event, e.label]));
  const rows = notifs.data?.notifications ?? [];

  if (notifs.isPending) return <Spinner />;
  if (rows.length === 0) return <p className="muted t-body-s">Zatím nic nového.</p>;

  return (
    <>
      <div style={{ display: "grid", gap: 8, overflowY: "auto" }}>
        {rows.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`notif ${n.read ? "" : "notif-unread"}`}
            onClick={() => {
              markRead.mutate([n.id]);
              onOpen(n);
            }}
          >
            {!n.read && <span className="notif-dot" aria-hidden="true" />}
            <span className="notif-body">
              <span className="notif-event">{labels.get(n.event) ?? n.event}</span>
              <p className="notif-text">{n.body}</p>
              <span className="notif-time">{ago(n.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={() => markRead.mutate(undefined)}>
        Označit přečtené
      </Button>
    </>
  );
}

/** Přepínače e-mailového kanálu — in-app zprávy se nevypínají. */
export function NotifPrefsPanel() {
  const prefs = useNotifPrefs();
  const setPref = useSetNotifPref();
  const meta = new Map(NOTIF_EVENTS.map((e) => [e.event, e]));

  return (
    <div style={{ display: "grid", gap: 2 }}>
      {(prefs.data?.prefs ?? []).map((p) => (
        <div key={p.event} className="meta-row">
          <span>
            {meta.get(p.event)?.label ?? p.event}
            <span className="notif-time" style={{ display: "block" }}>
              {meta.get(p.event)?.trigger}
            </span>
          </span>
          <Switch
            checked={p.email}
            label={`E-mail: ${meta.get(p.event)?.label ?? p.event}`}
            onChange={(email) => setPref.mutate({ event: p.event, email })}
          />
        </div>
      ))}
      <p className="muted t-caption" style={{ marginTop: 8 }}>
        Zprávy v aplikaci chodí vždy, vypnout jde jen e-mail.
      </p>
    </div>
  );
}

export function NotifBell({ variant = "sheet" }: { variant?: "sheet" | "popover" }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const notifs = useNotifications();
  const navigate = useNavigate();
  const unread = notifs.data?.unread ?? 0;

  function openTarget(n: { order_id: string | null; contact_id: string | null }) {
    setOpen(false);
    if (n.order_id) navigate(`/zakazky/${n.order_id}`);
    else if (n.contact_id) navigate(`/kontakty/${n.contact_id}`);
  }

  return (
    <>
      <button
        type="button"
        className="bell"
        aria-label={unread ? `Zprávy (${unread} nepřečtených)` : "Zprávy"}
        onClick={() => {
          setSettings(false);
          setOpen(true);
        }}
      >
        <Icon name="zvonek" size={21} />
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Zprávy"
            style={
              variant === "popover"
                ? { maxWidth: 420, margin: "auto", borderRadius: "var(--radius-xl)" }
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <span className="sheet-title">{settings ? "Nastavení notifikací" : "Zprávy"}</span>
              <button
                type="button"
                className="sheet-close"
                onClick={() => (settings ? setSettings(false) : setOpen(false))}
                aria-label={settings ? "Zpět na zprávy" : "Zavřít"}
              >
                {settings ? "←" : "✕"}
              </button>
            </div>
            {settings ? <NotifPrefsPanel /> : <NotifList onOpen={openTarget} />}
            {!settings && (
              <Button variant="ghost" onClick={() => setSettings(true)}>
                ⚙ Nastavení notifikací
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// --- shell technika ------------------------------------------------------------

export function TechNav() {
  const fresh = useFreshCount();
  const me = useMe();
  const count = fresh.data?.count ?? 0;
  // Kancelář na telefonu vidí tuhle navigaci taky — bez odkazu na Nastavení
  // by se na účty a produkty nedostala jinak než ručním přepsáním adresy.
  const office = me.data?.role === "kancelar";
  return (
    <nav className={`tech-nav ${office ? "tech-nav-4" : ""}`} aria-label="Hlavní navigace">
      <NavLink to="/" end>
        <span className="tech-nav-icon">
          <Icon name="dnes" />
        </span>
        {office ? "Přehled" : "Dnes"}
      </NavLink>
      <NavLink to="/kontakty">
        <span className="tech-nav-icon">
          <Icon name="kontakty" />
        </span>
        Kontakty
        {count > 0 && <span className="tech-nav-badge">{count}</span>}
      </NavLink>
      <NavLink to="/zakazky">
        <span className="tech-nav-icon">
          <Icon name="zakazky" />
        </span>
        Zakázky
      </NavLink>
      {office && (
        <NavLink to="/nastaveni">
          <span className="tech-nav-icon">
            <Icon name="nastaveni" />
          </span>
          Nastavení
        </NavLink>
      )}
    </nav>
  );
}

/**
 * Mobilní obrazovku (technikův tvar) zasadí kanceláři do jejího rámu s railem.
 * Detail kontaktu i formulář položky používají technikův layout v obou rolích —
 * bez tohohle by kancelář uprostřed práce ztratila celou levou navigaci.
 */
function InOfficeFrame({ children }: { children: ReactNode }) {
  const office = useOfficeView();
  if (!office) return <>{children}</>;
  return (
    <div className="office office-embed">
      <Rail />
      <div className="office-main">{children}</div>
    </div>
  );
}

/** Obrazovka technika: hlavička s nadpisem, obsah, spodní navigace. */
export function TechScreen({
  title,
  subtitle,
  action,
  bell = false,
  nav = true,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  bell?: boolean;
  nav?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="tech">
      <header className="tech-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="tech-greeting">{title}</h1>
          {subtitle && <p className="tech-date">{subtitle}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
          {action}
          {bell && <NotifBell />}
        </div>
      </header>
      <div className={`tech-body ${nav ? "tech-body-nav" : ""}`}>{children}</div>
      {nav && <TechNav />}
    </div>
  );
}

/** Detail v technikově tvaru, ale u kanceláře uvnitř jejího rámu s railem. */
export function TechDetailFramed(props: Parameters<typeof TechDetail>[0]) {
  return (
    <InOfficeFrame>
      <TechDetail {...props} />
    </InOfficeFrame>
  );
}

/** Detailní obrazovka: zpět nahoře, vlastní patka místo navigace. */
export function TechDetail({
  back,
  backLabel,
  headRight,
  footer,
  children,
}: {
  back: string;
  backLabel: string;
  headRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="tech">
      <div className="tech-bar">
        <Link to={back} className="back-btn">
          ← {backLabel}
        </Link>
        {headRight}
      </div>
      <div className={`tech-body ${footer ? "tech-body-footer" : ""}`}>{children}</div>
      {footer && <div className="tech-footer">{footer}</div>}
    </div>
  );
}

// --- shell kanceláře -------------------------------------------------------------

const RAIL: { to: string; label: string; icon: IconName; end: boolean }[] = [
  { to: "/", label: "Přehled", icon: "prehled", end: true },
  { to: "/kontakty", label: "Kontakty", icon: "kontakty", end: false },
  { to: "/zakazky", label: "Zakázky", icon: "zakazky", end: false },
  { to: "/statistiky", label: "Statistiky", icon: "statistiky", end: false },
  { to: "/nastaveni", label: "Nastavení", icon: "nastaveni", end: false },
];

/** Levá navigace kanceláře. Sdílená i detailními obrazovkami (detail kontaktu,
 *  formulář položky) — kancelář uprostřed práce nesmí přijít o navigaci. */
export function Rail() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const fresh = useFreshCount();
  const freshCount = fresh.data?.count ?? 0;

  return (
    <aside className="rail">
      <Link to="/" className="rail-logo" aria-label="Anse">
        <Logo height={20} />
      </Link>
      <nav className="rail-nav" aria-label="Hlavní navigace">
        {RAIL.map((r) => (
          <NavLink key={r.to} to={r.to} end={r.end} className="rail-link" title={r.label}>
            <span className="rail-icon">
              <Icon name={r.icon} size={20} />
            </span>
            <span className="rail-label">{r.label}</span>
            {r.to === "/kontakty" && freshCount > 0 && (
              <span className="rail-badge">{freshCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="rail-user">
        <span>{me.data?.name}</span>
        <button
          type="button"
          className="link-btn"
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
        >
          Odhlásit
        </button>
      </div>
    </aside>
  );
}

export function OfficeShell({
  title,
  subtitle,
  search,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  search?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="office">
      <Rail />
      <div className="office-main">
        <header className="office-head">
          <div className="office-head-titles">
            <h1 className="office-title">{title}</h1>
            {subtitle && <p className="office-subtitle">{subtitle}</p>}
          </div>
          {search && <div className="office-search">{search}</div>}
          <NotifBell variant="popover" />
          {actions}
        </header>
        <div className="office-body">{children}</div>
      </div>
    </div>
  );
}

/** Kořen přihlášené části — čeká na identitu a drží scroll nahoře. */
export function Shell() {
  const me = useMe();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (me.isPending) {
    return (
      <div className="page-center">
        <Spinner />
      </div>
    );
  }
  return <Outlet />;
}

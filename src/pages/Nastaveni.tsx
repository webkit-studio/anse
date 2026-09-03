import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DODAVATELE, dodavatelZKlice } from "@shared/dodavatele";
import { NOTIF_EVENTS, ROLE_LABELS, displayName, type Role } from "@shared/types";
import { ago } from "@shared/format";
import { api } from "../api/client";
import { useMe, useProductTypes, useSettings, useUsers } from "../api/hooks";
import { Icon } from "../components/Icon";
import { navodySlugsFor } from "../components/NavodOverlay";
import { NotifPrefsPanel, OfficeShell } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  ConfirmButton,
  Field,
  NativeSelect,
  Spinner,
  Switch,
  TextInput,
  ValueRow,
} from "../components/ui";
import { useQueryClient } from "@tanstack/react-query";

const CARDS = [
  { to: "/nastaveni/produkty", title: "Produkty", desc: "Názvy, poznámky pro techniky, dostupnost" },
  { to: "/nastaveni/notifikace", title: "Notifikace", desc: "Co komu chodí a kam" },
  { to: "/nastaveni/ucty", title: "Účty", desc: "Přihlašovací kódy, role, telefony" },
];

// --- Produkty -----------------------------------------------------------------

function Produkty() {
  const types = useProductTypes();
  const qc = useQueryClient();
  const toast = useToast();

  async function patchType(id: string, body: Record<string, unknown>) {
    await api(`/api/product-types/${id}`, { method: "PATCH", body });
    void qc.invalidateQueries({ queryKey: ["product-types"] });
  }
  async function patchSub(id: string, body: Record<string, unknown>) {
    await api(`/api/subcategories/${id}`, { method: "PATCH", body });
    void qc.invalidateQueries({ queryKey: ["product-types"] });
  }

  return (
    <OfficeShell title="Produkty" subtitle="Dvě úrovně: produkt → podkategorie">
      <p className="muted t-body-s">
        Pole formulářů se nastavují v definicích u dodavatele, ne tady. V aplikaci jde přejmenovat
        položku katalogu, přidat poznámku pro technika a vypnout dostupnost.
      </p>
      {types.isPending && <Spinner />}
      {(types.data?.product_types ?? []).map((t) => (
        <section className="card card-pad" key={t.id} style={{ display: "grid", gap: 12 }}>
          <div className="settings-row">
            <div className="settings-col">
              <TextInput
                defaultValue={t.custom_name}
                placeholder={t.name}
                aria-label={`Název produktu ${t.name}`}
                onBlur={(e) => {
                  if (e.target.value !== t.custom_name) void patchType(t.id, { custom_name: e.target.value });
                }}
              />
              <span className="settings-orig">{t.name}</span>
            </div>
            <div className="settings-col">
              <TextInput
                defaultValue={t.note_for_tech}
                placeholder="Poznámka pro technika (ukáže se u výběru i jako návod)"
                aria-label={`Poznámka pro technika — ${t.name}`}
                onBlur={(e) => {
                  if (e.target.value !== t.note_for_tech)
                    void patchType(t.id, { note_for_tech: e.target.value });
                }}
              />
            </div>
            <Switch
              checked={t.active}
              label={`Aktivní: ${displayName(t)}`}
              onChange={(active) => {
                void patchType(t.id, { active });
                toast(active ? "Produkt zapnutý" : "Produkt vypnutý");
              }}
            />
          </div>

          {t.subcategories.map((s) => (
            <div key={s.id} className="settings-row settings-sub">
              <div className="settings-col">
                <TextInput
                  defaultValue={s.custom_name}
                  placeholder={s.name}
                  aria-label={`Název podkategorie ${s.name}`}
                  onBlur={(e) => {
                    if (e.target.value !== s.custom_name) void patchSub(s.id, { custom_name: e.target.value });
                  }}
                />
                <span className="settings-orig">
                  {s.name} · {s.field_count ?? 0} polí
                  {s.konfig_key ? " · z podkladů dodavatele" : ""}
                  {/* Odkaz na výrobce se skládá z dodavatele v konfig_key, ne
                      natvrdo z Jack Westu — SUYS ani Neva by ho jinak neměly.
                      Když známe slug návodu, míří rovnou na produkt. */}
                  {(() => {
                    const dod = dodavatelZKlice(s.konfig_key);
                    const slug = navodySlugsFor(s)[0];
                    if (!dod && !slug) return null;
                    const href = slug
                      ? `${DODAVATELE.jackwest.web}/produkt/${slug}`
                      : dod!.web;
                    return (
                      <>
                        {" · "}
                        <a href={href} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                          {dod ? `${dod.nazev} ↗` : "stránka výrobce ↗"}
                        </a>
                      </>
                    );
                  })()}
                </span>
              </div>
              <div className="settings-col">
                <TextInput
                  defaultValue={s.note}
                  placeholder="Poznámka"
                  aria-label={`Poznámka — ${s.name}`}
                  onBlur={(e) => {
                    if (e.target.value !== s.note) void patchSub(s.id, { note: e.target.value });
                  }}
                />
              </div>
              <Switch
                checked={s.active}
                label={`Aktivní: ${displayName(s)}`}
                onChange={(active) => void patchSub(s.id, { active })}
              />
            </div>
          ))}
          {t.subcategories.length === 0 && (
            <p className="muted t-caption" style={{ paddingLeft: 20 }}>
              Zatím bez podkategorií — přidají se s definicí formuláře od dodavatele.
            </p>
          )}
        </section>
      ))}
    </OfficeShell>
  );
}

// --- Notifikace ----------------------------------------------------------------

function Notifikace() {
  const me = useMe();
  const settings = useSettings(true);
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [udalosti, setUdalosti] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setEmail(settings.data.admin_group_email);
    setUdalosti(settings.data.admin_group_events ?? {});
  }, [settings.data]);

  async function save() {
    await api("/api/settings", {
      method: "PUT",
      body: { admin_group_email: email, admin_group_events: udalosti },
    });
    await settings.refetch();
    toast("Nastavení uložené");
  }

  async function test() {
    setBusy(true);
    const res = await api<{ ok: boolean; message: string }>("/api/settings/test-email", {
      method: "POST",
    });
    toast(res.message);
    setBusy(false);
  }

  return (
    <OfficeShell title="Notifikace" subtitle="Zprávy v aplikaci chodí vždy, e-mail je volitelný">
      <section className="card card-pad">
        <h2 className="card-section-title">Moje e-maily</h2>
        <p className="muted t-body-s">
          Chodí na adresu tvého účtu{me.data?.email ? ` (${me.data.email})` : ""}. Vlastní adresu
          si nastav v Účtech.
        </p>
        {!me.data?.email && (
          <p className="field-msg field-msg-warning">
            U tvého účtu není e-mail, takže ti žádný nedorazí. Doplň ho v Nastavení → Účty.
          </p>
        )}
        <NotifPrefsPanel />
      </section>

      <section className="card card-pad">
        <h2 className="card-section-title">Přehled událostí</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Typ</th>
                <th>Spouštěč</th>
                <th>Zpráva</th>
                <th>Komu</th>
                <th>Aplikace</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {NOTIF_EVENTS.map((e) => (
                <tr key={e.event}>
                  <td className="cell-strong">{e.label}</td>
                  <td className="cell-muted">{e.trigger}</td>
                  <td className="cell-muted">{e.template}</td>
                  <td>{ROLE_LABELS[e.to]}</td>
                  <td>✓</td>
                  <td className="cell-muted">
                    {e.to === me.data?.role ? "nastavíš výše" : "nastavuje si technik"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="card-section-title">Společná adresa kanceláře</h2>
        <p className="muted t-body-s">
          Adresa, na kterou chodí zprávy pro celou kancelář — nezávisle na tom, co má kdo
          nastavené u sebe. Víc adres oddělte čárkou.
        </p>
        <Field label="E-mail kanceláře" htmlFor="s-email">
          <TextInput
            id="s-email"
            type="email"
            value={email}
            placeholder="kancelar@anse.cz"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <h3 className="card-section-title card-section-title-inline" style={{ marginTop: 16 }}>
          Co na ni chodí
        </h3>
        <div className="value-rows">
          {NOTIF_EVENTS.filter((e) => e.to === "kancelar").map((e) => (
            <ValueRow key={e.event} label={e.label} value="" hint={e.trigger}>
              <Switch
                checked={udalosti[e.event] ?? e.emailDefault}
                label={`Na adresu kanceláře: ${e.label}`}
                onChange={(v) => setUdalosti({ ...udalosti, [e.event]: v })}
              />
            </ValueRow>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button variant="primary" onClick={() => void save()}>
            Uložit
          </Button>
          <Button variant="secondary" onClick={() => void test()} disabled={busy}>
            {busy ? "Odesílám…" : "Poslat zkušební zprávu"}
          </Button>
        </div>
        {!email.trim() && (
          <p className="field-msg field-msg-warning" style={{ marginTop: 8 }}>
            Bez adresy nechodí kanceláři žádný e-mail. Zprávy v aplikaci chodí vždycky.
          </p>
        )}
      </section>
    </OfficeShell>
  );
}

// --- Účty -------------------------------------------------------------------------

function Ucty() {
  const users = useUsers(true);
  const qc = useQueryClient();
  const toast = useToast();
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("technik");

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["users"] });
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nepodařilo se uložit.");
    }
  }

  async function newCode(id: string) {
    await api(`/api/users/${id}/code`, { method: "POST" });
    await refresh();
    setShown((prev) => new Set(prev).add(id));
    toast("Vygenerován nový kód");
  }

  async function create() {
    if (!newName.trim()) return;
    await api("/api/users", { method: "POST", body: { name: newName, role: newRole } });
    setNewName("");
    await refresh();
    toast("Účet založený — kód zobrazíš ikonou oka");
  }

  return (
    <OfficeShell title="Účty" subtitle="Přihlášení šestimístným kódem">
      <section className="card card-pad user-new">
        <div className="user-new-name">
          <Field label="Jméno" htmlFor="u-new">
            <TextInput
              id="u-new"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Jan Novák"
            />
          </Field>
        </div>
        <div className="user-new-role">
          <Field label="Role" htmlFor="u-role">
            <NativeSelect
              id="u-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="technik">technik</option>
              <option value="kancelar">kancelář</option>
            </NativeSelect>
          </Field>
        </div>
        <Button variant="primary" onClick={() => void create()} disabled={!newName.trim()}>
          + Přidat účet
        </Button>
      </section>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Jméno</th>
              <th>Role</th>
              <th>Telefon</th>
              <th>E-mail</th>
              <th>Kód</th>
              <th className="col-secondary">Založen</th>
              <th>Aktivní</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="cell-strong">{u.name}</td>
                <td>
                  <NativeSelect
                    value={u.role}
                    aria-label={`Role ${u.name}`}
                    onChange={(e) => void patch(u.id, { role: e.target.value })}
                  >
                    <option value="technik">technik</option>
                    <option value="kancelar">kancelář</option>
                  </NativeSelect>
                </td>
                <td>
                  <input
                    className="inline-edit"
                    defaultValue={u.phone}
                    placeholder="—"
                    aria-label={`Telefon ${u.name}`}
                    onBlur={(e) => e.target.value !== u.phone && void patch(u.id, { phone: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="inline-edit"
                    defaultValue={u.email}
                    placeholder="—"
                    aria-label={`E-mail ${u.name}`}
                    onBlur={(e) => e.target.value !== u.email && void patch(u.id, { email: e.target.value })}
                  />
                  {/* bez adresy mu e-mailové notifikace tiše nechodí */}
                  {!u.email && <span className="badge badge-warn">chybí e-mail</span>}
                </td>
                <td className="code-cell">
                  {shown.has(u.id) ? u.code : "••••••"}{" "}
                  <button
                    type="button"
                    className="icon-btn"
                    title={shown.has(u.id) ? "Skrýt" : "Zobrazit"}
                    aria-label={shown.has(u.id) ? `Skrýt kód ${u.name}` : `Zobrazit kód ${u.name}`}
                    onClick={() =>
                      setShown((s) => {
                        const next = new Set(s);
                        if (next.has(u.id)) next.delete(u.id);
                        else next.add(u.id);
                        return next;
                      })
                    }
                  >
                    <Icon name={shown.has(u.id) ? "oko-skrt" : "oko"} size={18} />
                  </button>
                  <ConfirmButton
                    label={<Icon name="obnovit" size={17} />}
                    confirmLabel="Opravdu nový kód?"
                    className="btn-narrow"
                    title="Restartovat kód"
                    ariaLabel={`Vygenerovat nový kód pro ${u.name}`}
                    onConfirm={() => void newCode(u.id)}
                  />
                </td>
                <td className="cell-muted col-secondary">{ago(u.created_at)}</td>
                <td>
                  <Switch
                    checked={u.active}
                    label={`Aktivní: ${u.name}`}
                    onChange={(active) => void patch(u.id, { active })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted t-caption">
        Kódy generuje server náhodně a nikdy je nezapisuje do logů. „Nový" vydá jiný kód —
        ten starý tím okamžitě přestane platit.
      </p>
    </OfficeShell>
  );
}

// --- rozcestník ------------------------------------------------------------------

export default function NastaveniPage() {
  const { section } = useParams();
  if (section === "produkty") return <Produkty />;
  if (section === "notifikace") return <Notifikace />;
  if (section === "ucty") return <Ucty />;

  return (
    <OfficeShell title="Nastavení" subtitle="Katalog, zprávy a přístupy">
      <div className="settings-grid">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="settings-card">
            <span className="t-section">{c.title}</span>
            <span className="muted t-body-s">{c.desc}</span>
          </Link>
        ))}
      </div>
    </OfficeShell>
  );
}

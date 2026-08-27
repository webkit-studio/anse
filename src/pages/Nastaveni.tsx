import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { NOTIF_EVENTS, ROLE_LABELS, displayName, type Role } from "@shared/types";
import { ago } from "@shared/format";
import { api } from "../api/client";
import { useMe, useProductTypes, useSettings, useUsers } from "../api/hooks";
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
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
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
            <div style={{ flex: 1 }}>
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
            <div
              key={s.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                paddingLeft: 20,
                borderLeft: "2px solid var(--c-hairline)",
              }}
            >
              <div style={{ flex: 1 }}>
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
                </span>
              </div>
              <div style={{ flex: 1 }}>
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) setEmail(settings.data.admin_group_email);
  }, [settings.data]);

  async function save() {
    await api("/api/settings", { method: "PUT", body: { admin_group_email: email } });
    toast("Adresa uložená");
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
          Sem chodí zprávy pro kancelář, pokud nikdo nemá vyplněný vlastní e-mail. Víc adres
          oddělte čárkou.
        </p>
        <Field label="E-mail pro notifikace" htmlFor="s-email">
          <TextInput id="s-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" onClick={() => void save()}>
            Uložit
          </Button>
          <Button variant="secondary" onClick={() => void test()} disabled={busy}>
            {busy ? "Odesílám…" : "Poslat zkušební zprávu"}
          </Button>
        </div>
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
      <section className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Field label="Jméno" htmlFor="u-new">
            <TextInput
              id="u-new"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Jan Novák"
            />
          </Field>
        </div>
        <div style={{ width: 200 }}>
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
                </td>
                <td className="code-cell">
                  {shown.has(u.id) ? u.code : "••••••"}{" "}
                  <button
                    type="button"
                    className="link-btn"
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
                    {shown.has(u.id) ? "skrýt" : "zobrazit"}
                  </button>{" "}
                  <ConfirmButton
                    label="nový"
                    confirmLabel="Opravdu?"
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

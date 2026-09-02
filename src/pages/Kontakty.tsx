import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ContactRow } from "@shared/types";
import { ago } from "@shared/format";
import { api } from "../api/client";
import { useContacts, useInvalidateContacts, useUsers } from "../api/hooks";
import { Icon } from "../components/Icon";
import { OfficeShell, TechScreen, useOfficeView } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  Chips,
  EmptyState,
  NativeSelect,
  SkeletonList,
  Textarea,
  ToneBadge,
  useDelayed,
} from "../components/ui";

const FILTERS = [
  { value: "vse", label: "Vše" },
  { value: "fresh", label: "Ozvat se" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Meta řádek: co se s kontaktem děje, bez pipeline a stavů. */
function contactMeta(c: ContactRow): string {
  if ((c.open_order_count ?? 0) > 0) return "Běží zakázka";
  if ((c.order_count ?? 0) > 0) return "Zakázka hotová";
  return "";
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}

/**
 * Znovuoznačení „ozvat se" chce vždy poznámku — ať ten, kdo bude volat, ví proč.
 * Zhasnutí je naopak na jeden tap.
 */
function FreshSheet({
  contact,
  onClose,
  onSaved,
}: {
  contact: ContactRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    if (!note.trim()) {
      toast("Napiš proč — ať volající ví, o co jde.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/contacts/${contact.id}/notes`, { method: "POST", body: { text: note.trim() } });
      await api(`/api/contacts/${contact.id}`, { method: "PATCH", body: { fresh: true } });
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nepodařilo se uložit.");
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Označit ozvat se"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span className="sheet-title">{contact.name || contact.phone} — ozvat se</span>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </div>
        <Textarea
          value={note}
          rows={2}
          autoFocus
          placeholder="Proč se ozvat? (volal znovu, chce doplnit síť…)"
          aria-label="Důvod"
          onChange={(e) => setNote(e.target.value)}
        />
        <Button variant="primary" className="btn-block" disabled={busy} onClick={() => void save()}>
          Označit „ozvat se“
        </Button>
      </div>
    </div>
  );
}

/** Hvězdička v řádku: svítí = ozvat se. Rozsvícení si řekne o poznámku. */
function FreshStar({
  contact,
  onToggle,
}: {
  contact: ContactRow;
  onToggle: (c: ContactRow) => void;
}) {
  return (
    <button
      type="button"
      className="star-btn"
      aria-pressed={contact.fresh}
      aria-label={contact.fresh ? "Zrušit „ozvat se“" : "Označit „ozvat se“"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(contact);
      }}
    >
      <Icon name={contact.fresh ? "hvezda-plna" : "hvezda"} size={19} />
    </button>
  );
}

function ContactRowCard({
  contact,
  onToggleFresh,
}: {
  contact: ContactRow;
  onToggleFresh: (c: ContactRow) => void;
}) {
  const meta = contactMeta(contact);
  return (
    <div className="card" style={{ display: "flex", alignItems: "center" }}>
      <Link to={`/kontakty/${contact.id}`} className="card-link" style={{ flex: 1, minWidth: 0, width: "auto" }}>
        <span className="card-main">
          {contact.fresh && (
            <span className="card-badges">
              <ToneBadge tone="todo">Ozvat se</ToneBadge>
              {contact.assignee_name && (
                <span className="muted t-caption">{contact.assignee_name}</span>
              )}
            </span>
          )}
          <span className="card-title">{contact.name || contact.phone}</span>
          <span className="card-sub">
            {[contact.name ? contact.phone : "", contact.place, !contact.fresh ? meta : ""]
              .filter(Boolean)
              .join(" · ") || "bez dalších údajů"}
          </span>
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: 12, flex: "none" }}>
        <FreshStar contact={contact} onToggle={onToggleFresh} />
        {/* Volat mají jen čerstvé kontakty — ostatní řádky zůstávají tiché. */}
        {contact.fresh && contact.phone && (
          <a href={telHref(contact.phone)} className="btn btn-secondary" style={{ minHeight: 44 }}>
            <Icon name="volat" size={16} /> Volat
          </a>
        )}
      </div>
    </div>
  );
}

/** Inline editovatelná buňka v tabulce kanceláře. */
function InlineCell({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="inline-edit"
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

export default function KontaktyPage() {
  const office = useOfficeView();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const filter = (params.get("filtr") as Filter | null) ?? "vse";
  const contacts = useContacts(search, filter);
  const users = useUsers(office);
  const invalidate = useInvalidateContacts();
  const navigate = useNavigate();
  const toast = useToast();
  const showSkeleton = useDelayed(contacts.isPending);
  const [freshFor, setFreshFor] = useState<ContactRow | null>(null);
  const rows = contacts.data?.contacts ?? [];

  function setFilter(next: Filter) {
    setParams(next === "vse" ? {} : { filtr: next }, { replace: true });
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await api(`/api/contacts/${id}`, { method: "PATCH", body });
    await invalidate(id);
  }

  function toggleFresh(c: ContactRow) {
    if (c.fresh) {
      void patch(c.id, { fresh: false });
    } else {
      setFreshFor(c);
    }
  }

  const filterChips = (
    <Chips options={FILTERS} value={filter} onChange={setFilter} scroll={!office} />
  );

  const freshSheet = freshFor && (
    <FreshSheet
      contact={freshFor}
      onClose={() => setFreshFor(null)}
      onSaved={() => {
        setFreshFor(null);
        void invalidate(freshFor.id);
        toast("Označeno „ozvat se“");
      }}
    />
  );

  if (office) {
    return (
      <OfficeShell
        title="Kontakty"
        subtitle={"Databáze čísel — hvězdička znamená „ozvat se“"}
        search={
          <input
            type="search"
            placeholder="Jméno, telefon nebo místo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Hledat kontakt"
          />
        }
        actions={
          <Link to="/kontakty/novy" className="btn btn-primary">
            + Nový kontakt
          </Link>
        }
      >
        {filterChips}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th aria-label="Ozvat se" />
                <th>Jméno</th>
                <th>Telefon</th>
                <th>Místo</th>
                <th>Ozve se</th>
                <th>Stav</th>
                <th className="col-secondary">Zakázky</th>
                <th className="col-secondary">Přidán</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="row-link" onClick={() => navigate(`/kontakty/${c.id}`)}>
                  <td style={{ width: 44 }}>
                    <FreshStar contact={c} onToggle={toggleFresh} />
                  </td>
                  <td className="cell-strong">
                    <InlineCell
                      value={c.name}
                      placeholder="Jméno"
                      onSave={(name) => void patch(c.id, { name })}
                    />
                  </td>
                  <td>
                    <InlineCell
                      value={c.phone}
                      placeholder="Telefon"
                      onSave={(phone) => void patch(c.id, { phone })}
                    />
                  </td>
                  <td>
                    <InlineCell
                      value={c.place}
                      placeholder="Místo"
                      onSave={(place) => void patch(c.id, { place })}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <NativeSelect
                      value={c.assigned_to ?? ""}
                      placeholder="— nikdo —"
                      aria-label={`Ozve se — ${c.name || c.phone}`}
                      onChange={(e) => void patch(c.id, { assigned_to: e.target.value || null })}
                    >
                      <option value="">— nikdo —</option>
                      {(users.data?.users ?? [])
                        .filter((u) => u.active)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </td>
                  <td>
                    {c.fresh ? (
                      <ToneBadge tone="todo">Ozvat se</ToneBadge>
                    ) : (
                      <span className="cell-muted">{contactMeta(c) || "—"}</span>
                    )}
                  </td>
                  <td className="num col-secondary">{c.order_count ?? 0}</td>
                  <td className="cell-muted col-secondary">{ago(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !contacts.isPending && (
          <EmptyState title="Žádné kontakty">
            <p>Nový kontakt stačí založit se jménem nebo telefonem.</p>
          </EmptyState>
        )}
        {freshSheet}
      </OfficeShell>
    );
  }

  return (
    <TechScreen
      title="Kontakty"
      action={
        <Link to="/kontakty/novy" className="btn btn-primary" style={{ minHeight: 44 }}>
          + Nový
        </Link>
      }
    >
      <input
        type="search"
        placeholder="Jméno nebo telefon"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Hledat kontakt"
      />
      {filterChips}

      {contacts.isPending && showSkeleton && <SkeletonList />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((c) => (
          <ContactRowCard key={c.id} contact={c} onToggleFresh={toggleFresh} />
        ))}
      </div>

      {rows.length === 0 && !contacts.isPending && (
        <EmptyState title="Žádné kontakty">
          <p>
            {filter === "fresh"
              ? "Nikomu se teď nemusíš ozývat."
              : "Nový kontakt stačí založit se jménem nebo telefonem."}
          </p>
        </EmptyState>
      )}
      {freshSheet}
    </TechScreen>
  );
}

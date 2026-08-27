import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ContactRow } from "@shared/types";
import { ago } from "@shared/format";
import { api } from "../api/client";
import { useContacts, useInvalidateContacts } from "../api/hooks";
import { OfficeShell, TechScreen, useOfficeView } from "../components/Shell";
import { Chips, EmptyState, SkeletonList, useDelayed } from "../components/ui";

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

function ContactRowCard({ contact }: { contact: ContactRow }) {
  const meta = contactMeta(contact);
  return (
    <div className="card" style={{ display: "flex", alignItems: "center" }}>
      <Link to={`/kontakty/${contact.id}`} className="card-link" style={{ flex: 1 }}>
        <span className="card-main">
          {contact.fresh && (
            <span className="card-badges">
              <span className="badge tone-todo">
                <span className="badge-glyph" aria-hidden="true">
                  ●
                </span>
                Ozvat se
              </span>
            </span>
          )}
          <span className="card-title">{contact.name || contact.phone}</span>
          <span className="card-sub">
            {[contact.name ? contact.phone : "", contact.place].filter(Boolean).join(" · ") ||
              "bez dalších údajů"}
          </span>
          {meta && (
            <span className="card-sub" style={{ color: "var(--c-text-muted)" }}>
              {meta}
            </span>
          )}
        </span>
        {!contact.fresh && (
          <span className="card-chevron" aria-hidden="true">
            ›
          </span>
        )}
      </Link>
      {/* Volat mají jen čerstvé kontakty — ostatní řádky zůstávají tiché. */}
      {contact.fresh && contact.phone && (
        <a
          href={telHref(contact.phone)}
          className="btn btn-secondary"
          style={{ margin: "0 14px 0 0", flex: "none" }}
        >
          ✆ Volat
        </a>
      )}
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("vse");
  const contacts = useContacts(search, filter);
  const invalidate = useInvalidateContacts();
  const navigate = useNavigate();
  const showSkeleton = useDelayed(contacts.isPending);
  const rows = contacts.data?.contacts ?? [];

  async function patch(id: string, body: Record<string, unknown>) {
    await api(`/api/contacts/${id}`, { method: "PATCH", body });
    invalidate(id);
  }

  const filterChips = (
    <Chips options={FILTERS} value={filter} onChange={setFilter} scroll={!office} />
  );

  if (office) {
    return (
      <OfficeShell
        title="Kontakty"
        subtitle="Databáze čísel — bez stavů a přidělování"
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
                <th>Jméno</th>
                <th>Telefon</th>
                <th>Místo</th>
                <th>Stav</th>
                <th className="col-secondary">Zakázky</th>
                <th className="col-secondary">Přidán</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="row-link" onClick={() => navigate(`/kontakty/${c.id}`)}>
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
                  <td>
                    {c.fresh ? (
                      <span className="badge tone-todo">
                        <span className="badge-glyph" aria-hidden="true">
                          ●
                        </span>
                        Ozvat se
                      </span>
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
          <ContactRowCard key={c.id} contact={c} />
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
    </TechScreen>
  );
}

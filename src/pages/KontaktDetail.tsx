import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ContactRow } from "@shared/types";
import { ago, czDateShort } from "@shared/format";
import { api } from "../api/client";
import { useContact, useInvalidateContacts, useInvalidateOrder, useMe } from "../api/hooks";
import { DateSheet, isoDay } from "../components/DateSheet";
import { TechDetail } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  ConfirmButton,
  ErrorBanner,
  PhaseBadge,
  SkeletonList,
  Textarea,
  useDelayed,
} from "../components/ui";

/** Inline editovatelné pole — dashed podtržení a tužka, žádný modal. */
function InlineField({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="meta-row">
        <span className="meta-label">{label}</span>
        <button
          type="button"
          className="meta-value"
          style={{
            background: "none",
            borderBottom: "1px dashed var(--c-border-strong)",
            minHeight: 32,
            padding: "2px 0",
          }}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          {value || <span className="muted">{placeholder}</span>} <span aria-hidden="true">✎</span>
        </button>
      </div>
    );
  }

  return (
    <div className="field" style={{ marginBottom: 0, padding: "8px 0" }}>
      <label className="field-label" htmlFor={`inline-${label}`}>
        {label}
      </label>
      <input
        id={`inline-${label}`}
        value={draft}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
      />
    </div>
  );
}

export default function KontaktDetailPage() {
  const { contactId = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useContact(contactId);
  const invalidate = useInvalidateContacts();
  const invalidateOrder = useInvalidateOrder();
  const showSkeleton = useDelayed(detail.isPending);

  const [note, setNote] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const contact = detail.data?.contact;
  const notes = detail.data?.notes ?? [];
  const orders = detail.data?.orders ?? [];

  async function patch(body: Partial<ContactRow>) {
    await api(`/api/contacts/${contactId}`, { method: "PATCH", body });
    await invalidate(contactId);
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setNote("");
    await api(`/api/contacts/${contactId}/notes`, { method: "POST", body: { text } });
    await invalidate(contactId);
  }

  async function createOrder(measured_at: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/orders", {
        method: "POST",
        body: { contact_id: contactId, measured_at },
      });
      await invalidate(contactId);
      await invalidateOrder(id);
      toast("Zakázka založená");
      navigate(`/zakazky/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Zakázku se nepodařilo založit.");
      setBusy(false);
    }
  }

  async function cancelContact() {
    const reason = note.trim();
    if (!reason) {
      toast("Napiš do poznámky důvod zrušení, pak zruš.");
      return;
    }
    await api(`/api/contacts/${contactId}/cancel`, { method: "POST", body: { reason } });
    await invalidate(contactId);
    toast("Kontakt zrušený");
    navigate("/kontakty");
  }

  if (detail.isError) {
    return (
      <TechDetail back="/kontakty" backLabel="Kontakty">
        <ErrorBanner message="Kontakt se nepodařilo načíst." onRetry={() => detail.refetch()} />
      </TechDetail>
    );
  }

  return (
    <TechDetail
      back="/kontakty"
      backLabel="Kontakty"
      headRight={
        contact?.phone ? (
          <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="btn btn-secondary">
            ✆ Volat
          </a>
        ) : undefined
      }
      footer={
        contact && (
          <Button variant="primary" onClick={() => setDateOpen(true)} disabled={busy}>
            {orders.length === 0 ? "Zadat termín zaměření" : "＋ Nová zakázka"}
          </Button>
        )
      }
    >
      {detail.isPending && showSkeleton && <SkeletonList cards={2} />}

      {contact && (
        <>
          <div>
            <h1 className="t-title" style={{ margin: "4px 0 6px" }}>
              {contact.name || contact.phone}
            </h1>
            <button
              type="button"
              className={`chip ${contact.fresh ? "chip-active" : ""}`}
              aria-pressed={contact.fresh}
              onClick={() => void patch({ fresh: !contact.fresh })}
            >
              {contact.fresh ? "● Ozvat se" : "Označit „ozvat se"}
            </button>
          </div>

          <section className="card card-pad">
            <InlineField
              label="Jméno"
              value={contact.name}
              placeholder="doplnit jméno"
              onSave={(name) => void patch({ name })}
            />
            <InlineField
              label="Telefon"
              value={contact.phone}
              placeholder="doplnit telefon"
              onSave={(phone) => void patch({ phone })}
            />
            <InlineField
              label="Místo"
              value={contact.place}
              placeholder="doplnit místo"
              onSave={(place) => void patch({ place })}
            />
          </section>

          {orders.length > 0 && (
            <section>
              <h2 className="card-section-title">Zakázky kontaktu</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {orders.map((o) => (
                  <div className="card" key={o.id}>
                    <Link to={`/zakazky/${o.id}`} className="card-link">
                      <span className="card-main">
                        <span className="card-badges">
                          <PhaseBadge phase={o.phase} role={me.data?.role ?? "technik"} />
                        </span>
                        <span className="card-title">{o.addr_montaz || "bez adresy"}</span>
                        <span className="card-sub">
                          {o.item_count} pol.
                          {o.term_montaz ? ` · montáž ${czDateShort(o.term_montaz)}` : ""}
                        </span>
                      </span>
                      <span className="card-chevron" aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="card-section-title">Poznámky</h2>
            <div className="card card-pad" style={{ display: "grid", gap: 10 }}>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Co jsme domluvili…"
                rows={2}
                aria-label="Nová poznámka"
              />
              <Button variant="secondary" onClick={() => void addNote()} disabled={!note.trim()}>
                Přidat poznámku
              </Button>
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {notes.map((n) => (
                <div className="card card-pad" key={n.id}>
                  <p style={{ margin: 0 }}>{n.text}</p>
                  <p className="notif-time" style={{ margin: "6px 0 0" }}>
                    {n.author_name} · {ago(n.created_at)}
                  </p>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="muted t-body-s">Zatím žádné poznámky. Zůstávají tu navždy.</p>
              )}
            </div>
          </section>

          <ConfirmButton
            label="Zrušit kontakt"
            confirmLabel="Opravdu zrušit?"
            className="order-delete"
            onConfirm={() => void cancelContact()}
          />
          <p className="muted t-caption" style={{ margin: "-8px 0 0" }}>
            Zrušení vyžaduje důvod — napiš ho do poznámky nahoře, uloží se k němu.
          </p>
        </>
      )}

      {dateOpen && (
        <DateSheet
          title="Termín zaměření"
          value={isoDay(new Date())}
          confirmLabel="Založit zakázku"
          onClose={() => setDateOpen(false)}
          onPick={(iso) => {
            setDateOpen(false);
            void createOrder(iso);
          }}
        />
      )}
    </TechDetail>
  );
}

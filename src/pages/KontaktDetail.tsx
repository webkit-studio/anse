import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ContactRow } from "@shared/types";
import { ago, czDateShort } from "@shared/format";
import { api } from "../api/client";
import {
  useContact,
  useInvalidateContacts,
  useInvalidateOrder,
  useMe,
  useUsersForPicker,
} from "../api/hooks";
import { DateSheet, isoDay } from "../components/DateSheet";
import { Icon } from "../components/Icon";
import { TechDetailFramed } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  CancelBlock,
  ErrorBanner,
  PhaseBadge,
  SelectSheet,
  SkeletonList,
  Textarea,
  ValueRow,
  useDelayed,
} from "../components/ui";

export default function KontaktDetailPage() {
  const { contactId = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useContact(contactId);
  const users = useUsersForPicker();
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
    await api(`/api/contacts/${contactId}/notes`, {
      method: "POST",
      body: { text },
    });
    await invalidate(contactId);
  }

  async function createOrder(measured_at: string, measured_time: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/orders", {
        method: "POST",
        body: { contact_id: contactId, measured_at, measured_time },
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

  async function cancelContact(reason: string) {
    await api(`/api/contacts/${contactId}/cancel`, {
      method: "POST",
      body: { reason },
    });
    await invalidate(contactId);
    toast("Kontakt zrušený");
    navigate("/kontakty");
  }

  if (detail.isError) {
    return (
      <TechDetailFramed back="/kontakty" backLabel="Kontakty">
        <ErrorBanner message="Kontakt se nepodařilo načíst." onRetry={() => detail.refetch()} />
      </TechDetailFramed>
    );
  }

  return (
    <TechDetailFramed
      back="/kontakty"
      backLabel="Kontakty"
      headRight={
        contact?.phone ? (
          <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="btn btn-secondary">
            <Icon name="volat" size={17} /> Volat
          </a>
        ) : undefined
      }
      footer={
        contact && (
          <Button variant="primary" onClick={() => setDateOpen(true)} disabled={busy}>
            {orders.length === 0 ? "Zaměřit" : "＋ Další zaměření"}
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
              {contact.fresh ? "● Ozvat se" : "Označit „ozvat se“"}
            </button>
          </div>

          <section className="card card-pad">
            <div className="value-rows">
              <ValueRow label="Ozve se" value="">
                <SelectSheet
                  id="c-assignee"
                  value={contact.assigned_to ?? ""}
                  placeholder="— nikdo —"
                  options={[
                    { value: "", label: "— nikdo —" },
                    ...(users.data?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
                  ]}
                  onChange={(v) => void patch({ assigned_to: (v || null) as never })}
                />
              </ValueRow>
              <ValueRow
                label="Jméno"
                value={contact.name}
                placeholder="doplnit jméno"
                onSave={(name) => patch({ name })}
              />
              <ValueRow
                label="Telefon"
                kind="tel"
                value={contact.phone}
                placeholder="doplnit telefon"
                onSave={(phone) => patch({ phone })}
              />
              <ValueRow
                label="Místo"
                kind="adresa"
                value={contact.place}
                placeholder="doplnit místo"
                onSave={(place) => patch({ place })}
              />
            </div>
          </section>

          {orders.length > 0 && (
            <section>
              <h2 className="card-section-title">Zakázky kontaktu</h2>
              <div className="card-list">
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

          <CancelBlock
            label="Zrušit kontakt"
            placeholder="Proč kontakt rušíme? (uloží se jako poznámka)"
            onCancel={(reason) => void cancelContact(reason)}
          />
        </>
      )}

      {dateOpen && (
        <DateSheet
          title="Termín zaměření"
          value={isoDay(new Date())}
          withTime
          // „Zaměřit" je to, co technik opravdu dělá; zakázka ve fázi
          // k zaměření z toho vznikne sama, ale nemusí to znít jako papírování.
          confirmLabel="Zaměřit"
          onClose={() => setDateOpen(false)}
          onPick={(iso, time) => {
            setDateOpen(false);
            void createOrder(iso, time);
          }}
        />
      )}
    </TechDetailFramed>
  );
}

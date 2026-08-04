import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ClientRow } from "@shared/types";
import { api, isConflict } from "../api/client";
import { useClientSearch, useMe } from "../api/hooks";
import { PhoneInput, emailIssue, phoneIssue } from "../components/PhoneInput";
import { useToast } from "../components/Toast";
import { Button, ConfirmButton, Field, Spinner, TextInput } from "../components/ui";

/** Úprava karty zákazníka přímo z výběru „Stávající" (jen admin). */
function ClientEditSheet({
  client,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState({
    name: client.name,
    phone: client.phone,
    email: client.email,
    address: client.address,
    delivery_address: client.delivery_address,
    contact_person: client.contact_person,
    ico: client.ico,
    dic: client.dic,
    note: client.note,
  });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameProblem = data.name.trim() === "" ? "Vyplňte jméno nebo firmu." : null;
  const phoneProblem = phoneIssue(data.phone);
  const emailProblem = data.email.trim() === "" ? "Vyplňte e-mail." : emailIssue(data.email);
  const addressProblem = data.address.trim() === "" ? "Vyplňte adresu." : null;

  // zámek scrollu stránky pod sheetem (stejně jako SelectSheet)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const set = (key: keyof typeof data) => (value: string) => setData({ ...data, [key]: value });

  async function save() {
    if (nameProblem || phoneProblem || emailProblem || addressProblem) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/clients/${client.id}`, {
        method: "PATCH",
        body: { ...data, expected_updated_at: client.updated_at },
      });
      toast("Zákazník upraven.");
      onSaved();
    } catch (err) {
      setError(
        isConflict(err)
          ? "Zákazníka mezitím upravil někdo jiný — zavřete a otevřete znovu."
          : err instanceof Error
            ? err.message
            : "Uložení se nepodařilo.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet client-edit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Upravit zákazníka ${client.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span className="sheet-title">Upravit zákazníka</span>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </div>
        <div className="client-edit-fields">
          <Field
            label="Firma / jméno a příjmení"
            htmlFor="ce-name"
            required
            messages={attempted && nameProblem ? [{ level: "error", message: nameProblem }] : []}
          >
            <TextInput id="ce-name" value={data.name} onChange={(e) => set("name")(e.target.value)} />
          </Field>
          <Field
            label="Telefon"
            htmlFor="ce-phone"
            messages={attempted && phoneProblem ? [{ level: "error", message: phoneProblem }] : []}
          >
            <PhoneInput id="ce-phone" value={data.phone} onChange={set("phone")} />
          </Field>
          <Field
            label="E-mail"
            htmlFor="ce-email"
            required
            messages={attempted && emailProblem ? [{ level: "error", message: emailProblem }] : []}
          >
            <TextInput
              id="ce-email"
              type="email"
              inputMode="email"
              value={data.email}
              onChange={(e) => set("email")(e.target.value)}
            />
          </Field>
          <Field
            label="Adresa"
            htmlFor="ce-address"
            required
            messages={attempted && addressProblem ? [{ level: "error", message: addressProblem }] : []}
          >
            <TextInput id="ce-address" value={data.address} onChange={(e) => set("address")(e.target.value)} />
          </Field>
          <div className="field-row">
            <Field label="IČ" htmlFor="ce-ico">
              <TextInput id="ce-ico" inputMode="numeric" value={data.ico} onChange={(e) => set("ico")(e.target.value)} />
            </Field>
            <Field label="DIČ" htmlFor="ce-dic">
              <TextInput id="ce-dic" value={data.dic} onChange={(e) => set("dic")(e.target.value)} />
            </Field>
          </div>
          <Field label="Dodací adresa" htmlFor="ce-delivery" help="Nechte prázdné, pokud je stejná.">
            <TextInput
              id="ce-delivery"
              value={data.delivery_address}
              onChange={(e) => set("delivery_address")(e.target.value)}
            />
          </Field>
          <Field label="Kontaktní osoba" htmlFor="ce-contact">
            <TextInput
              id="ce-contact"
              value={data.contact_person}
              onChange={(e) => set("contact_person")(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="field-msg field-msg-error">{error}</p>}
        <div className="header-edit-actions">
          <Button variant="ghost" onClick={onClose}>
            Zavřít
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Uložit
          </Button>
        </div>
      </div>
    </div>
  );
}

interface NewClientFields {
  name: string;
  phone: string;
  email: string;
  address: string;
  delivery_address: string;
  contact_person: string;
  ico: string;
  dic: string;
}

const EMPTY_CLIENT: NewClientFields = {
  name: "",
  phone: "",
  email: "",
  address: "",
  delivery_address: "",
  contact_person: "",
  ico: "",
  dic: "",
};

export default function OrderNewPage() {
  const me = useMe();
  const isAdmin = me.data?.role === "admin";

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [client, setClient] = useState<NewClientFields>(EMPTY_CLIENT);
  const [moreClient, setMoreClient] = useState(false);
  const [existing, setExisting] = useState<ClientRow | null>(null);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [clientSearch, setClientSearch] = useState("");

  // Místo montáže: defaultně shodné s adresou zákazníka (Markovo „někdy je stejná").
  const [sameAddress, setSameAddress] = useState(true);
  const [installationAddress, setInstallationAddress] = useState("");
  const [montageNumber, setMontageNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [note, setNote] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const toast = useToast();
  const search = useClientSearch(clientSearch.trim(), mode === "existing");

  async function archiveClient(c: ClientRow) {
    try {
      await api(`/api/clients/${c.id}`, { method: "DELETE" });
      toast("Zákazník odstraněn ze seznamu.");
      void search.refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Smazání se nepodařilo.");
    }
  }

  // Povinná pole zákazníka (jen u nového; stávající se posílá jako {id}).
  const clientMissing = mode === "new" ? client.name.trim() === "" : existing === null;
  const addressProblem = mode === "new" && client.address.trim() === "" ? "Vyplňte adresu." : null;
  const phoneProblem = mode === "new" ? phoneIssue(client.phone) : null;
  const emailProblem =
    mode === "new"
      ? client.email.trim() === ""
        ? "Vyplňte e-mail."
        : emailIssue(client.email)
      : null;
  // Místo montáže povinné, jen když NENÍ shodné s adresou zákazníka.
  const installationProblem =
    !sameAddress && installationAddress.trim() === "" ? "Vyplňte místo montáže." : null;

  function set(field: keyof NewClientFields, value: string) {
    setClient((c) => ({ ...c, [field]: value }));
  }

  async function submit() {
    setAttempted(true);
    setError(null);
    if (clientMissing || addressProblem || phoneProblem || emailProblem || installationProblem) return;

    setBusy(true);
    try {
      const body = {
        client: mode === "existing" && existing ? { id: existing.id } : { new: client },
        // shodná adresa → prázdné, server doplní adresu zákazníka
        installation_address: sameAddress ? "" : installationAddress.trim(),
        montage_number: isAdmin ? montageNumber.trim() : "",
        order_number: isAdmin ? orderNumber.trim() : "",
        delivery_date: isAdmin && deliveryDate ? deliveryDate : null,
        note: note.trim(),
      };
      const { id } = await api<{ id: string }>("/api/orders", { method: "POST", body });
      toast("Zakázka založena.");
      navigate(`/zakazky/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zakázku se nepodařilo založit.");
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Nová zakázka</h1>
      <p className="required-legend">
        <span className="field-required">*</span> povinný údaj
      </p>

      <section className="form-group">
        <h2 className="form-group-title">Zákazník</h2>
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "new"}
            className={`segmented-btn ${mode === "new" ? "segmented-active" : ""}`}
            onClick={() => setMode("new")}
          >
            Nový zákazník
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "existing"}
            className={`segmented-btn ${mode === "existing" ? "segmented-active" : ""}`}
            onClick={() => setMode("existing")}
          >
            Stávající
          </button>
        </div>

        {mode === "new" ? (
          <>
            <Field
              label="Firma / jméno a příjmení"
              htmlFor="c-name"
              required
              messages={
                attempted && clientMissing
                  ? [{ level: "error", message: "Vyplňte jméno nebo firmu." }]
                  : []
              }
            >
              <TextInput
                id="c-name"
                value={client.name}
                autoFocus
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field
              label="Telefon"
              htmlFor="c-phone"
              messages={attempted && phoneProblem ? [{ level: "error", message: phoneProblem }] : []}
            >
              <PhoneInput id="c-phone" value={client.phone} onChange={(v) => set("phone", v)} />
            </Field>
            <Field
              label="E-mail"
              htmlFor="c-email"
              required
              messages={attempted && emailProblem ? [{ level: "error", message: emailProblem }] : []}
            >
              <TextInput
                id="c-email"
                type="email"
                inputMode="email"
                value={client.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field
              label="Adresa"
              htmlFor="c-address"
              required
              messages={attempted && addressProblem ? [{ level: "error", message: addressProblem }] : []}
            >
              <TextInput
                id="c-address"
                value={client.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Ulice č., město"
              />
            </Field>
            {!moreClient ? (
              <Button variant="ghost" onClick={() => setMoreClient(true)}>
                + Další údaje (IČ, DIČ, dodací adresa…)
              </Button>
            ) : (
              <>
                <div className="field-row">
                  <Field label="IČ" htmlFor="c-ico">
                    <TextInput
                      id="c-ico"
                      inputMode="numeric"
                      value={client.ico}
                      onChange={(e) => set("ico", e.target.value)}
                    />
                  </Field>
                  <Field label="DIČ" htmlFor="c-dic">
                    <TextInput id="c-dic" value={client.dic} onChange={(e) => set("dic", e.target.value)} />
                  </Field>
                </div>
                <Field label="Dodací adresa" htmlFor="c-delivery" help="Nechte prázdné, pokud je stejná.">
                  <TextInput
                    id="c-delivery"
                    value={client.delivery_address}
                    onChange={(e) => set("delivery_address", e.target.value)}
                  />
                </Field>
                <Field label="Kontaktní osoba" htmlFor="c-contact">
                  <TextInput
                    id="c-contact"
                    value={client.contact_person}
                    onChange={(e) => set("contact_person", e.target.value)}
                  />
                </Field>
              </>
            )}
          </>
        ) : existing ? (
          <div className="picked-client">
            <div>
              <strong>{existing.name}</strong>
              {existing.address && <div className="muted">{existing.address}</div>}
              {existing.phone && <div className="muted">{existing.phone}</div>}
            </div>
            <Button variant="ghost" onClick={() => setExisting(null)}>
              Změnit
            </Button>
          </div>
        ) : (
          <>
            <Field
              label="Vyhledat zákazníka"
              htmlFor="c-search"
              required
              messages={
                attempted && clientMissing ? [{ level: "error", message: "Vyberte zákazníka." }] : []
              }
            >
              <TextInput
                id="c-search"
                type="search"
                autoFocus
                placeholder="Jméno, adresa, telefon, IČ…"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </Field>
            {search.isFetching && <Spinner />}
            {search.data && (
              <ul className="picker-list">
                {search.data.clients.map((c) => (
                  <li key={c.id} className="picker-row">
                    <button type="button" className="picker-item" onClick={() => setExisting(c)}>
                      <strong>{c.name}</strong>
                      {(c.address || c.phone) && (
                        <span className="muted">{[c.address, c.phone].filter(Boolean).join(" · ")}</span>
                      )}
                    </button>
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          className="picker-icon"
                          aria-label={`Upravit zákazníka ${c.name}`}
                          onClick={() => setEditingClient(c)}
                        >
                          ✎
                        </Button>
                        <ConfirmButton
                          label="🗑"
                          confirmLabel="Opravdu?"
                          ariaLabel={`Smazat zákazníka ${c.name}`}
                          className="picker-icon picker-trash"
                          onConfirm={() => void archiveClient(c)}
                        />
                      </>
                    )}
                  </li>
                ))}
                {search.data.clients.length === 0 && (
                  <li className="muted picker-empty">Nikdo nenalezen — založte nového zákazníka.</li>
                )}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="form-group">
        <h2 className="form-group-title">Montáž</h2>
        <label className="toggle toggle-block">
          <input
            type="checkbox"
            checked={sameAddress}
            onChange={(e) => setSameAddress(e.target.checked)}
          />
          Místo montáže je shodné s adresou zákazníka
        </label>
        {!sameAddress && (
          <Field
            label="Místo montáže"
            htmlFor="o-address"
            required
            messages={
              attempted && installationProblem
                ? [{ level: "error", message: installationProblem }]
                : []
            }
          >
            <TextInput
              id="o-address"
              value={installationAddress}
              autoFocus
              onChange={(e) => setInstallationAddress(e.target.value)}
              placeholder="Ulice č., město"
            />
          </Field>
        )}
        <Field label="Poznámka k zakázce" htmlFor="o-note">
          <TextInput id="o-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {isAdmin && (
          <>
            <div className="field-row">
              <Field label="Číslo montáže" htmlFor="o-montage">
                <TextInput
                  id="o-montage"
                  value={montageNumber}
                  onChange={(e) => setMontageNumber(e.target.value)}
                />
              </Field>
              <Field label="Číslo zakázky" htmlFor="o-number">
                <TextInput
                  id="o-number"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="např. ZAK26071"
                />
              </Field>
            </div>
            <Field label="Termín dodání" htmlFor="o-delivery">
              <input
                id="o-delivery"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </Field>
          </>
        )}
      </section>

      {error && <p className="field-msg field-msg-error">{error}</p>}

      <div className="form-actions">
        <Button variant="primary" className="btn-block" disabled={busy} onClick={() => void submit()}>
          {busy ? "Zakládám…" : "Založit zakázku"}
        </Button>
      </div>

      {editingClient && (
        <ClientEditSheet
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => {
            setEditingClient(null);
            void search.refetch();
          }}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ClientRow } from "@shared/types";
import { api } from "../api/client";
import { useClientSearch, useMe } from "../api/hooks";
import { PhoneInput, emailIssue, phoneIssue } from "../components/PhoneInput";
import { useToast } from "../components/Toast";
import { Button, Field, Spinner, TextInput } from "../components/ui";

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
  const [clientSearch, setClientSearch] = useState("");

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

  const clientMissing = mode === "new" ? client.name.trim() === "" : existing === null;
  const phoneProblem = mode === "new" ? phoneIssue(client.phone) : null;
  const emailProblem = mode === "new" ? emailIssue(client.email) : null;

  function set(field: keyof NewClientFields, value: string) {
    setClient((c) => ({ ...c, [field]: value }));
  }

  async function submit() {
    setAttempted(true);
    setError(null);
    if (clientMissing || phoneProblem || emailProblem) return;

    setBusy(true);
    try {
      const body = {
        client: mode === "existing" && existing ? { id: existing.id } : { new: client },
        installation_address: installationAddress.trim(),
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
            <Field label="Adresa" htmlFor="c-address">
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
                  <li key={c.id}>
                    <button type="button" className="picker-item" onClick={() => setExisting(c)}>
                      <strong>{c.name}</strong>
                      {(c.address || c.phone) && (
                        <span className="muted">{[c.address, c.phone].filter(Boolean).join(" · ")}</span>
                      )}
                    </button>
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
        <Field
          label="Místo montáže"
          htmlFor="o-address"
          help="Nechte prázdné, pokud je stejné jako adresa zákazníka."
        >
          <TextInput
            id="o-address"
            value={installationAddress}
            onChange={(e) => setInstallationAddress(e.target.value)}
            placeholder="= adresa zákazníka"
          />
        </Field>
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
    </div>
  );
}

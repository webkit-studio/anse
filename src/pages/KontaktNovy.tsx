import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ContactRow } from "@shared/types";
import { api } from "../api/client";
import { useInvalidateContacts } from "../api/hooks";
import { TechDetail } from "../components/Shell";
import { PhoneInput } from "../components/PhoneInput";
import { useToast } from "../components/Toast";
import { Button, Field, TextInput } from "../components/ui";

/**
 * Nový kontakt: jméno NEBO telefon, nic víc — musí se stihnout během telefonátu.
 * Zbytek se doplní v detailu, až bude čas.
 */
export default function KontaktNovyPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidateContacts();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [place, setPlace] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canSave = name.trim() !== "" || phone.trim() !== "";

  async function save() {
    if (busy) return;
    if (!canSave) {
      setError("Vyplň jméno nebo telefon.");
      return;
    }
    setBusy(true);
    try {
      const { contact } = await api<{ contact: ContactRow }>("/api/contacts", {
        method: "POST",
        body: { name, phone, place },
      });
      await invalidate();
      toast("Kontakt uložený");
      navigate(`/kontakty/${contact.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kontakt se nepodařilo uložit.");
      setBusy(false);
    }
  }

  return (
    <TechDetail
      back="/kontakty"
      backLabel="Kontakty"
      footer={
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Ukládám…" : "Založit kontakt"}
        </Button>
      }
    >
      <h1 className="t-title" style={{ margin: "4px 0 0" }}>
        Nový kontakt
      </h1>
      <p className="muted t-body-s" style={{ margin: 0 }}>
        Stačí jméno <strong>nebo</strong> telefon. Zbytek doplníš, až bude čas.
      </p>

      <div className="card card-pad">
        <Field label="Jméno" htmlFor="c-name">
          <TextInput
            id="c-name"
            value={name}
            autoFocus
            autoComplete="name"
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="Novák Jan"
          />
        </Field>
        <Field label="Telefon" htmlFor="c-phone">
          <PhoneInput
            id="c-phone"
            value={phone}
            onChange={(v) => {
              setPhone(v);
              setError("");
            }}
          />
        </Field>
        <Field label="Místo" htmlFor="c-place" help="Obec nebo čtvrť — kvůli plánování cesty.">
          <TextInput
            id="c-place"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Ostrava-Poruba"
          />
        </Field>
        {error && (
          <p className="field-msg field-msg-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </TechDetail>
  );
}

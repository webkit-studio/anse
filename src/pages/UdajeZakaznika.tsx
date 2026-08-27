import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, isConflict } from "../api/client";
import { useInvalidateOrder, useOrder } from "../api/hooks";
import { PhoneInput, emailIssue, phoneIssue } from "../components/PhoneInput";
import { TechDetail } from "../components/Shell";
import { useToast } from "../components/Toast";
import { Button, Field, Spinner, Switch, TextInput } from "../components/ui";

/**
 * Blokující krok technika před první položkou. Dokud se nepokusí pokračovat,
 * žádná červená — jen hvězdičky u povinných polí.
 */
export default function UdajeZakaznikaPage() {
  const { orderId = "" } = useParams();
  const [params] = useSearchParams();
  const next = params.get("dal"); // kam pokračovat po uložení
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useOrder(orderId);
  const invalidate = useInvalidateOrder();
  const order = detail.data?.order;

  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    addr_montaz: "",
    addr_fakt: "",
    ico: "",
    dic: "",
  });
  const [sameAddr, setSameAddr] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!order || loaded) return;
    setForm({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      addr_montaz: order.addr_montaz,
      addr_fakt: order.addr_fakt,
      ico: order.ico,
      dic: order.dic,
    });
    setSameAddr(!order.addr_fakt.trim() || order.addr_fakt === order.addr_montaz);
    setLoaded(true);
  }, [order, loaded]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const errors: Partial<Record<keyof typeof form, string>> = {};
  if (!form.customer_name.trim()) errors.customer_name = "Vyplňte jméno.";
  if (!form.customer_phone.trim()) errors.customer_phone = "Vyplňte telefon.";
  else {
    const issue = phoneIssue(form.customer_phone);
    if (issue) errors.customer_phone = issue;
  }
  if (!form.customer_email.trim()) errors.customer_email = "Vyplňte e-mail.";
  else {
    const issue = emailIssue(form.customer_email);
    if (issue) errors.customer_email = issue;
  }
  if (!form.addr_montaz.trim()) errors.addr_montaz = "Vyplňte adresu montáže.";
  if (!sameAddr && !form.addr_fakt.trim()) errors.addr_fakt = "Vyplňte fakturační adresu.";

  function msg(key: keyof typeof form) {
    return attempted && errors[key] ? [{ level: "error" as const, message: errors[key]! }] : [];
  }

  async function save() {
    if (busy || !order) return;
    setAttempted(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: {
          ...form,
          addr_fakt: sameAddr ? form.addr_montaz : form.addr_fakt,
          expected_updated_at: order.updated_at,
        },
      });
      await invalidate(orderId);
      toast("Údaje uložené");
      navigate(next === "polozka" ? `/zakazky/${orderId}/polozka/nova` : `/zakazky/${orderId}`, {
        replace: true,
      });
    } catch (err) {
      if (isConflict(err)) {
        toast("Zakázku mezitím upravil někdo jiný. Načítám znovu.");
        void detail.refetch();
        setLoaded(false);
      } else {
        toast(err instanceof Error ? err.message : "Údaje se nepodařilo uložit.");
      }
      setBusy(false);
    }
  }

  return (
    <TechDetail
      back={`/zakazky/${orderId}`}
      backLabel="Zakázka"
      footer={
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Ukládám…" : next === "polozka" ? "Uložit a přidat položku" : "Uložit"}
        </Button>
      }
    >
      {!order && <Spinner />}
      {order && (
        <>
          <h1 className="t-title" style={{ margin: "4px 0 0" }}>
            Údaje zákazníka
          </h1>
          <p className="muted t-body-s" style={{ margin: 0 }}>
            Bez nich nejde zakázku poslat k nacenění. Vyplň je jednou, drží se celé zakázky.
          </p>

          <div className="card card-pad">
            <Field label="Jméno" htmlFor="u-name" required messages={msg("customer_name")}>
              <TextInput
                id="u-name"
                value={form.customer_name}
                autoComplete="name"
                onChange={(e) => set("customer_name", e.target.value)}
              />
            </Field>
            <Field label="Telefon" htmlFor="u-phone" required messages={msg("customer_phone")}>
              <PhoneInput
                id="u-phone"
                value={form.customer_phone}
                onChange={(v) => set("customer_phone", v)}
              />
            </Field>
            <Field label="E-mail" htmlFor="u-email" required messages={msg("customer_email")}>
              <TextInput
                id="u-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.customer_email}
                onChange={(e) => set("customer_email", e.target.value)}
              />
            </Field>
            <Field label="Adresa montáže" htmlFor="u-addr" required messages={msg("addr_montaz")}>
              <TextInput
                id="u-addr"
                value={form.addr_montaz}
                autoComplete="street-address"
                onChange={(e) => set("addr_montaz", e.target.value)}
              />
            </Field>

            <div className="meta-row">
              <span>Fakturační adresa je stejná jako montážní</span>
              <Switch
                checked={sameAddr}
                label="Fakturační adresa je stejná jako montážní"
                onChange={setSameAddr}
              />
            </div>

            {!sameAddr && (
              <div className="field-revealed">
                <Field
                  label="Fakturační adresa"
                  htmlFor="u-addr-fakt"
                  required
                  messages={msg("addr_fakt")}
                >
                  <TextInput
                    id="u-addr-fakt"
                    value={form.addr_fakt}
                    onChange={(e) => set("addr_fakt", e.target.value)}
                  />
                </Field>
              </div>
            )}

            <div className="field-row">
              <Field label="IČO" htmlFor="u-ico">
                <TextInput
                  id="u-ico"
                  inputMode="numeric"
                  value={form.ico}
                  onChange={(e) => set("ico", e.target.value)}
                />
              </Field>
              <Field label="DIČ" htmlFor="u-dic">
                <TextInput id="u-dic" value={form.dic} onChange={(e) => set("dic", e.target.value)} />
              </Field>
            </div>
          </div>
        </>
      )}
    </TechDetail>
  );
}

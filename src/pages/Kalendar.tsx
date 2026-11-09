import { useMe, useMyCalendar, useNewCalendarLink } from "../api/hooks";
import { OfficeShell, TechDetail } from "../components/Shell";
import { useToast } from "../components/Toast";
import { Button, ConfirmButton, Spinner, copyText } from "../components/ui";

// Nastavení → Kalendář (S04, issue #5). Každý uživatel si vygeneruje osobní
// odkaz na odebíraný kalendář se zaměřeními a montážemi, které má přidělené.
// Funguje v Google kalendáři, na iPhonu i v Outlooku (ICS feed, žádné Google API).

/** Android neumí webcal: — tlačítko by tam nedělalo nic, tak se neukazuje. */
function umiWebcal(): boolean {
  return typeof navigator === "undefined" || !/android/i.test(navigator.userAgent);
}

function KalendarPanel() {
  const cal = useMyCalendar();
  const novy = useNewCalendarLink();
  const toast = useToast();
  const url = cal.data?.url ?? null;

  async function vytvor(prepis: boolean) {
    try {
      await novy.mutateAsync();
      toast(prepis ? "Nový odkaz je hotový. Starý už nefunguje — kalendář přidej znovu." : "Odkaz je hotový.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Odkaz se nepodařilo vytvořit.");
    }
  }

  async function zkopiruj() {
    if (!url) return;
    toast((await copyText(url)) ? "Odkaz zkopírovaný." : "Kopírování nejde — označ odkaz v poli a zkopíruj ho ručně.");
  }

  return (
    <div className="kalendar">
      <section className="card card-pad kalendar-sekce">
        <p className="t-body" style={{ margin: 0 }}>
          Zaměření a montáže, které máš přidělené, uvidíš v kalendáři v telefonu. Funguje s
          Google kalendářem i s iPhonem.
        </p>
        {cal.isPending && <Spinner />}
        {cal.isError && (
          <p className="field-msg field-msg-error" role="alert">
            Odkaz se nepodařilo načíst. Zkus stránku obnovit.
          </p>
        )}
        {cal.isSuccess && !url && (
          <Button variant="primary" className="kalendar-hlavni" disabled={novy.isPending} onClick={() => void vytvor(false)}>
            {novy.isPending ? "Vytvářím…" : "Vytvořit odkaz na kalendář"}
          </Button>
        )}
        {url && (
          <>
            <label className="kalendar-label" htmlFor="kalendar-url">
              Tvůj odkaz
            </label>
            <input
              id="kalendar-url"
              className="kalendar-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="kalendar-akce">
              <Button variant="primary" onClick={() => void zkopiruj()}>
                Zkopírovat odkaz
              </Button>
              {umiWebcal() && (
                <a className="btn btn-secondary" href={url.replace(/^https?:/, "webcal:")}>
                  Otevřít v kalendáři
                </a>
              )}
            </div>
          </>
        )}
      </section>

      {url && (
        <section className="card card-pad kalendar-sekce">
          <h2 className="card-section-title card-section-title-inline">Jak ho přidat</h2>
          <div className="kalendar-navod">
            <h3 className="t-section">iPhone</h3>
            <ol>
              <li>Klepni na „Otevřít v kalendáři".</li>
              <li>Potvrď „Odebírat" a pak „Přidat".</li>
            </ol>
          </div>
          <div className="kalendar-navod">
            <h3 className="t-section">Google kalendář (Android)</h3>
            <ol>
              <li>Zkopíruj odkaz a pošli si ho do počítače.</li>
              <li>Na počítači otevři calendar.google.com.</li>
              <li>U „Další kalendáře" dej + → „Z adresy URL".</li>
              <li>Vlož odkaz a dej „Přidat kalendář". Do telefonu se kalendář dostane sám.</li>
            </ol>
          </div>
          <p className="muted t-body-s" style={{ margin: 0 }}>
            Google odebírané kalendáře obnovuje se zpožděním, klidně i několik hodin. Termín,
            který potřebuješ v kalendáři hned, přidáš v zakázce ikonou kalendáře u termínu.
          </p>
        </section>
      )}

      {url && (
        <section className="card card-pad kalendar-sekce">
          <h2 className="card-section-title card-section-title-inline">Odkaz je jen tvůj</h2>
          <p className="t-body-s" style={{ margin: 0 }}>
            Kdo ho má, vidí tvoje termíny se jmény, telefony a adresami zákazníků. Nikomu ho
            neposílej. Když unikne nebo ztratíš telefon, vytvoř nový: starý hned přestane
            fungovat a kalendář bude potřeba přidat znovu.
          </p>
          <ConfirmButton
            label={novy.isPending ? "Vytvářím…" : "Vytvořit nový odkaz"}
            confirmLabel="Opravdu? Starý přestane fungovat"
            className="kalendar-novy"
            onConfirm={() => void vytvor(true)}
          />
        </section>
      )}
    </div>
  );
}

export default function KalendarPage() {
  const me = useMe();
  // Kancelář má Nastavení v railu i ve spodní liště; technik se sem dostane
  // ze Zprávy → Nastavení (vlastní Nastavení nemá).
  if (me.data?.role === "kancelar") {
    return (
      <OfficeShell title="Kalendář" subtitle="Moje zaměření a montáže v telefonu">
        <KalendarPanel />
      </OfficeShell>
    );
  }
  return (
    <TechDetail back="/" backLabel="Dnes">
      <h1 className="t-title" style={{ margin: "4px 0 0" }}>
        Kalendář
      </h1>
      <KalendarPanel />
    </TechDetail>
  );
}

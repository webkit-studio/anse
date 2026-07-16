import { useState } from "react";
import type { UserRow } from "@shared/types";
import { api } from "../api/client";
import { useSettings, useUsers } from "../api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";
import { Button, ConfirmButton, Field, NativeSelect, Spinner, TextInput } from "../components/ui";

function UserCard({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await api(`/api/users/${user.id}`, { method: "PATCH", body });
      onChanged();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uložení se nepodařilo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCode() {
    if (!/^\d{6}$/.test(codeDraft)) {
      toast("Kód musí mít přesně 6 číslic.");
      return;
    }
    if (await patch({ code: codeDraft })) {
      setEditingCode(false);
      setCodeDraft("");
      toast(`Kód pro ${user.name} změněn.`);
    }
  }

  async function regenerateCode() {
    setBusy(true);
    try {
      const { user: updated } = await api<{ user: UserRow }>(`/api/users/${user.id}/code`, {
        method: "POST",
      });
      onChanged();
      toast(`Nový kód pro ${updated.name}: ${updated.code}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kód se nepodařilo vygenerovat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`user-card ${user.active ? "" : "user-card-inactive"}`}>
      <div className="user-card-main">
        <strong>{user.name}</strong>
        {editingCode ? (
          <div className="user-code-edit">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              aria-label={`Nový kód pro ${user.name}`}
              placeholder="6 číslic"
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button variant="primary" disabled={busy || codeDraft.length !== 6} onClick={() => void saveCode()}>
              Uložit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingCode(false);
                setCodeDraft("");
              }}
              aria-label="Zrušit úpravu kódu"
            >
              ✕
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="user-code user-code-btn"
            title="Upravit kód"
            aria-label={`Upravit kód: ${user.name}`}
            onClick={() => {
              setEditingCode(true);
              setCodeDraft("");
            }}
          >
            {user.code} ✎
          </button>
        )}
      </div>
      <div className="user-card-controls">
        <NativeSelect
          aria-label={`Role: ${user.name}`}
          value={user.role}
          disabled={busy}
          onChange={(e) => void patch({ role: e.target.value })}
        >
          <option value="technik">technik</option>
          <option value="admin">admin</option>
        </NativeSelect>
        <label className="toggle">
          <input
            type="checkbox"
            checked={user.active}
            disabled={busy}
            onChange={(e) => void patch({ active: e.target.checked })}
          />
          aktivní
        </label>
        <ConfirmButton
          label="Nový kód"
          confirmLabel="Přegenerovat?"
          onConfirm={() => void regenerateCode()}
        />
      </div>
    </li>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const users = useUsers(true);
  const settings = useSettings(true);
  const toast = useToast();

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"technik" | "admin">("technik");
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<string | null>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  const refreshUsers = () => void qc.invalidateQueries({ queryKey: ["users"] });

  async function createUser() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { user } = await api<{ user: UserRow }>("/api/users", {
        method: "POST",
        body: { name: newName.trim(), role: newRole },
      });
      setCreatedInfo(`${user.name} — přihlašovací kód: ${user.code}`);
      setNewName("");
      refreshUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uživatele se nepodařilo založit.");
    } finally {
      setCreating(false);
    }
  }

  async function saveEmail() {
    setSavingEmail(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        body: { admin_group_email: (email ?? settings.data?.admin_group_email ?? "").trim() },
      });
      toast("Nastavení uloženo.");
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uložení se nepodařilo.");
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <div className="page">
      <h1>Správa</h1>

      <section className="form-group">
        <h2 className="form-group-title">Uživatelé a kódy</h2>

        {users.isPending && <Spinner />}
        {users.data && (
          <ul className="user-list">
            {users.data.users.map((u) => (
              <UserCard key={u.id} user={u} onChanged={refreshUsers} />
            ))}
          </ul>
        )}

        <div className="user-add">
          <Field label="Nový uživatel" htmlFor="nu-name">
            <TextInput
              id="nu-name"
              value={newName}
              placeholder="Jméno a příjmení"
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          <div className="user-add-row">
            <NativeSelect
              aria-label="Role nového uživatele"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "technik" | "admin")}
            >
              <option value="technik">technik</option>
              <option value="admin">admin</option>
            </NativeSelect>
            <Button variant="primary" disabled={creating || !newName.trim()} onClick={() => void createUser()}>
              Přidat
            </Button>
          </div>
          {createdInfo && (
            <p className="user-created" role="status">
              ✅ {createdInfo} — předejte ho uživateli.
            </p>
          )}
        </div>
      </section>

      <section className="form-group">
        <h2 className="form-group-title">Notifikace</h2>
        <Field
          label="Admin e-mail pro notifikace"
          htmlFor="s-email"
          help={"Na tuto adresu půjde upozornění při přepnutí zakázky na „K objednání“. Odesílání se aktivuje po otestování formulářů."}
        >
          <TextInput
            id="s-email"
            type="email"
            inputMode="email"
            value={email ?? settings.data?.admin_group_email ?? ""}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="objednavky@anse.cz"
          />
        </Field>
        <Button variant="primary" disabled={savingEmail} onClick={() => void saveEmail()}>
          Uložit nastavení
        </Button>
      </section>
    </div>
  );
}

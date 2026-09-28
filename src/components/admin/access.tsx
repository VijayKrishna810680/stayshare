"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Badge, Button, Input, Label, Textarea } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useAdminAction } from "./step-up";

type RoleOpt = { key: string; name: string; description?: string | null };

function RoleChecks({ roles, value, onChange, canSuper }: { roles: RoleOpt[]; value: string[]; onChange: (v: string[]) => void; canSuper: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-slate-700">Roles</legend>
      {roles.map((r) => (
        <label key={r.key} className="flex items-start gap-2 rounded-xl border border-slate-200 p-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" disabled={r.key === "SUPER_ADMIN" && !canSuper} checked={value.includes(r.key)} onChange={(e) => onChange(e.target.checked ? [...value, r.key] : value.filter((k) => k !== r.key))} />
          <span>
            <span className="font-medium">{r.name}</span> <code className="text-xs text-slate-500">{r.key}</code>
            {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Create an administrator account (OTP step-up enforced by the API). */
export function CreateAdminButton({ roles, canSuper }: { roles: RoleOpt[]; canSuper: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [keys, setKeys] = useState<string[]>(["ADMIN"]);
  const { exec, busy } = useAdminAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const out = await exec(() => apiFetch("/api/admin/admins", { method: "POST", json: { ...f, phone: f.phone || null, roleKeys: keys } }), { success: "Administrator created" });
    if (out !== undefined) {
      setOpen(false);
      setF({ name: "", email: "", phone: "", password: "" });
    }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New administrator
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create administrator" description="Share the temporary password securely; ask them to change it after first login. Requires OTP verification.">
        <form onSubmit={submit} className="space-y-3">
          {(
            [
              ["name", "Full name", "text"],
              ["email", "Email", "email"],
              ["phone", "Mobile (for OTP step-up)", "tel"],
              ["password", "Temporary password", "text"],
            ] as const
          ).map(([k, l, t]) => (
            <div key={k}>
              <Label htmlFor={`na-${k}`}>{l}</Label>
              <Input id={`na-${k}`} type={t} required={k !== "phone"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              {k === "password" && <p className="mt-1 text-xs text-slate-500">Min 10 characters with an uppercase letter and a number.</p>}
            </div>
          ))}
          <RoleChecks roles={roles} value={keys} onChange={setKeys} canSuper={canSuper} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!keys.length}>
              Create
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function EditRolesButton({ userId, name, roles, current, canSuper }: { userId: string; name: string; roles: RoleOpt[]; current: string[]; canSuper: boolean }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState(current);
  const { exec, busy } = useAdminAction();
  const save = async () => {
    const out = await exec(() => apiFetch(`/api/admin/admins/${userId}/roles`, { method: "PUT", json: { roleKeys: keys } }), { success: "Roles updated" });
    if (out !== undefined) setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit roles
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Roles for ${name}`}
        description="Removing every admin role revokes portal access. Requires OTP verification."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save roles
            </Button>
          </>
        }
      >
        <RoleChecks roles={roles} value={keys} onChange={setKeys} canSuper={canSuper} />
      </Dialog>
    </>
  );
}

type Perm = { key: string; description: string };

/** Create or edit a role's permission set. SUPER_ADMIN is always all permissions (read-only). */
export function RoleEditor({ role, perms, isNew }: { role?: { id: string; key: string; name: string; description: string | null; isSystem: boolean; permissions: string[]; members: number }; perms: Perm[]; isNew?: boolean }) {
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(false);
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [desc, setDesc] = useState(role?.description ?? "");
  const [sel, setSel] = useState<string[]>(role?.permissions ?? ["admin.access"]);
  const { exec, busy } = useAdminAction();
  const locked = role?.key === "SUPER_ADMIN";
  const modules = [...new Set(perms.map((p) => p.key.split(".")[0]!))];
  const save = async () => {
    const out = await exec(() => (isNew ? apiFetch("/api/admin/roles", { method: "POST", json: { key, name, description: desc || null, permissions: sel } }) : apiFetch(`/api/admin/roles/${role!.id}`, { method: "PUT", json: { name, description: desc || null, permissions: sel } })), { success: isNew ? "Role created" : "Role updated" });
    if (out !== undefined) setOpen(false);
  };
  const remove = async () => {
    const out = await exec(() => apiFetch(`/api/admin/roles/${role!.id}`, { method: "DELETE" }), { success: "Role deleted" });
    if (out !== undefined) setDel(false);
  };
  return (
    <>
      <div className="flex gap-1.5">
        <Button size="sm" variant={isNew ? "primary" : "outline"} onClick={() => setOpen(true)}>
          {isNew ? (
            <>
              <Plus className="h-4 w-4" /> New role
            </>
          ) : locked ? (
            "View"
          ) : (
            "Edit permissions"
          )}
        </Button>
        {role && !role.isSystem && (
          <Button size="sm" variant="ghost" aria-label="Delete role" onClick={() => setDel(true)}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        )}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={isNew ? "New role" : `${role!.name} permissions`}
        description={locked ? "The super administrator always has every permission." : "Tick the permissions this role grants. Changes apply immediately to every member (OTP verification required)."}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            {!locked && (
              <Button onClick={save} loading={busy} disabled={isNew && (!key || !name)}>
                Save
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {(isNew || !role?.isSystem) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {isNew && (
                <div>
                  <Label htmlFor="r-key">Key</Label>
                  <Input id="r-key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="SUPPORT_AGENT" />
                </div>
              )}
              <div>
                <Label htmlFor="r-name">Name</Label>
                <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="r-desc">Description</Label>
                <Textarea id="r-desc" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-14" />
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <fieldset key={m} className="rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{m}</legend>
                {perms
                  .filter((p) => p.key.startsWith(m + "."))
                  .map((p) => (
                    <label key={p.key} className="flex items-start gap-2 py-1 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" disabled={locked || (p.key === "admin.access" && role?.key !== "OWNER" && role?.key !== "STAFF" && role?.key !== "CUSTOMER")} checked={locked || sel.includes(p.key)} onChange={(e) => setSel(e.target.checked ? [...sel, p.key] : sel.filter((k) => k !== p.key))} />
                      <span>
                        <code className="text-xs">{p.key}</code>
                        <span className="block text-xs text-slate-500">{p.description}</span>
                      </span>
                    </label>
                  ))}
              </fieldset>
            ))}
          </div>
          {!locked && <p className="text-xs text-slate-500">{sel.length} permission(s) selected{role ? ` · ${role.members} member(s)` : ""}</p>}
        </div>
      </Dialog>
      {role && (
        <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} loading={busy} tone="danger" title={`Delete role ${role.name}?`} description="Only roles without members can be deleted." confirmText="Delete role">
          {role.members > 0 && <Badge tone="red">{role.members} member(s) still assigned</Badge>}
        </ConfirmDialog>
      )}
    </>
  );
}

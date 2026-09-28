"use client";
import { useState } from "react";
import { KeyRound, Plus, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Checkbox, EmptyState, Field, Input, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { call, useAction } from "./common";
import { staffCreateSchema } from "./schemas";

export type StaffRow = { id: string; name: string; email: string | null; phone: string | null; designation: string | null; active: boolean; lastLoginAt: string | null; propertyIds: string[] };

const PW_HINT = "At least 8 characters with upper & lower case letters, a number and a symbol.";

export function StaffAccounts({ staff, properties }: { staff: StaffRow[]; properties: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [create, setCreate] = useState<{ name: string; email: string; phone: string; password: string; designation: string; propertyIds: string[] } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assign, setAssign] = useState<StaffRow | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [toggle, setToggle] = useState<StaffRow | null>(null);
  const [pw, setPw] = useState<{ row: StaffRow; password: string } | null>(null);
  const name = (id: string) => properties.find((p) => p.id === id)?.name ?? "";

  const submit = async () => {
    const res = staffCreateSchema.safeParse({ ...create, designation: create!.designation || null });
    if (!res.success) {
      const e: Record<string, string> = {};
      for (const i of res.error.issues) e[String(i.path[0])] ??= i.message;
      setErrors(e);
      return toast.error("Please fix the highlighted fields");
    }
    const r = await run("create", () => call("/api/owner/staff", "POST", res.data), { success: `Staff login created for ${create!.name}` });
    if (r) setCreate(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => (setErrors({}), setCreate({ name: "", email: "", phone: "", password: "", designation: "", propertyIds: properties.map((p) => p.id) }))}>
          <Plus className="h-4 w-4" /> Add staff member
        </Button>
      </div>
      {staff.length === 0 ? (
        <EmptyState icon={<UserCog className="h-6 w-6" />} title="No staff accounts" description="Give your front-desk team their own login to check guests in and out and manage housekeeping. Staff never see your earnings." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Login</TH>
              <TH>Properties</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {staff.map((s) => (
              <TR key={s.id}>
                <TD>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.designation ?? "Staff"}</p>
                </TD>
                <TD className="text-sm">
                  {s.email ?? s.phone}
                  <p className="text-xs text-slate-500">{s.lastLoginAt ? `Last login ${new Date(s.lastLoginAt).toLocaleDateString("en-IN")}` : "Never logged in"}</p>
                </TD>
                <TD>
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {s.propertyIds.length ? s.propertyIds.map((id) => <Badge key={id}>{name(id)}</Badge>) : <span className="text-xs text-slate-500">None</span>}
                  </div>
                </TD>
                <TD>
                  <StatusBadge status={s.active ? "ACTIVE" : "SUSPENDED"} />
                </TD>
                <TD className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => (setSel(s.propertyIds), setAssign(s))}>
                    Properties
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPw({ row: s, password: "" })} aria-label={`Reset password for ${s.name}`}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className={s.active ? "text-red-600" : "text-emerald-700"} onClick={() => setToggle(s)}>
                    {s.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={!!create}
        onClose={() => setCreate(null)}
        title="Add staff member"
        description="They sign in at the normal login page with these details."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreate(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending === "create"}>
              Create login
            </Button>
          </>
        }
      >
        {create && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required error={errors.name}>
              {(p) => <Input {...p} value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} autoComplete="off" />}
            </Field>
            <Field label="Designation" error={errors.designation}>
              {(p) => <Input {...p} value={create.designation} onChange={(e) => setCreate({ ...create, designation: e.target.value })} placeholder="Front desk, Warden…" />}
            </Field>
            <Field label="Email" error={errors.email}>
              {(p) => <Input {...p} type="email" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} autoComplete="off" />}
            </Field>
            <Field label="Mobile" error={errors.phone}>
              {(p) => <Input {...p} type="tel" value={create.phone} onChange={(e) => setCreate({ ...create, phone: e.target.value })} autoComplete="off" />}
            </Field>
            <Field label="Temporary password" required error={errors.password} hint={PW_HINT} className="sm:col-span-2">
              {(p) => <Input {...p} type="text" value={create.password} onChange={(e) => setCreate({ ...create, password: e.target.value })} autoComplete="new-password" />}
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-slate-700">Can work at</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {properties.map((p) => (
                  <Checkbox key={p.id} label={p.name} checked={create.propertyIds.includes(p.id)} onChange={(e) => setCreate({ ...create, propertyIds: e.target.checked ? [...create.propertyIds, p.id] : create.propertyIds.filter((x) => x !== p.id) })} />
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!assign}
        onClose={() => setAssign(null)}
        title={`Properties for ${assign?.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssign(null)}>
              Cancel
            </Button>
            <Button
              loading={pending === "assign"}
              onClick={async () => {
                const r = await run("assign", () => call(`/api/owner/staff/${assign!.id}`, "PATCH", { propertyIds: sel }), { success: "Assignments updated" });
                if (r) setAssign(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          {properties.map((p) => (
            <Checkbox key={p.id} label={p.name} checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
          ))}
        </div>
      </Dialog>

      <Dialog
        open={!!pw}
        onClose={() => setPw(null)}
        title={`Reset password for ${pw?.row.name}`}
        description="They'll be signed out everywhere and must use the new password."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPw(null)}>
              Cancel
            </Button>
            <Button
              loading={pending === "pw"}
              onClick={async () => {
                const r = await run("pw", () => call(`/api/owner/staff/${pw!.row.id}`, "PATCH", { password: pw!.password }), { success: "Password reset" });
                if (r) setPw(null);
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        {pw && <Field label="New password" hint={PW_HINT}>{(p) => <Input {...p} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" />}</Field>}
      </Dialog>

      <ConfirmDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        title={toggle?.active ? `Deactivate ${toggle?.name}?` : `Reactivate ${toggle?.name}?`}
        description={toggle?.active ? "They are signed out immediately and can't log in until reactivated." : "They can sign in again with their existing password."}
        confirmText={toggle?.active ? "Deactivate" : "Reactivate"}
        tone={toggle?.active ? "danger" : "primary"}
        loading={pending === "t"}
        onConfirm={async () => {
          await run("t", () => call(`/api/owner/staff/${toggle!.id}`, "PATCH", { active: !toggle!.active }), { success: toggle!.active ? "Deactivated" : "Reactivated" });
          setToggle(null);
        }}
      />
    </div>
  );
}

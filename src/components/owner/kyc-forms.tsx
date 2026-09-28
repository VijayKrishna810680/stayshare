"use client";
import { useState } from "react";
import { FileText, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, Button, Field, Input, Select, StatusBadge, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/dialog";
import { call, useAction } from "./common";
import { humanize, KYC_DOC_TYPES } from "./format";
import { Uploader } from "./property-assets";

export type KycState = { businessName: string; businessType: string | null; gstin: string | null; panLast4: string | null; address: string | null; kycStatus: string; kycNotes: string | null };
export type KycDoc = { id: string; docType: string; numberLast4: string; fileId: string | null; status: string; createdAt: string };

export function KycForm({ state, docs }: { state: KycState; docs: KycDoc[] }) {
  const [v, setV] = useState({ businessName: state.businessName, businessType: state.businessType ?? "", gstin: state.gstin ?? "", pan: "", address: state.address ?? "" });
  const [docType, setDocType] = useState<string>(KYC_DOC_TYPES[0].value);
  const [docNo, setDocNo] = useState("");
  const [del, setDel] = useState<KycDoc | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { run, pending } = useAction();
  const locked = state.kycStatus === "APPROVED";
  const inReview = state.kycStatus === "PENDING";
  const payload = (submit: boolean) => ({ businessName: v.businessName, businessType: v.businessType, gstin: v.gstin, pan: v.pan, address: v.address, submit });
  const valid = () => {
    if (v.businessName.trim().length < 2) return toast.error("Business name is required"), false;
    if (v.address.trim().length < 5) return toast.error("Enter your business address"), false;
    if (v.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan)) return toast.error("Enter a valid PAN (e.g. ABCDE1234F)"), false;
    return true;
  };
  return (
    <div className="space-y-6">
      {state.kycStatus === "APPROVED" && <Alert tone="success" title="KYC verified">Your business is verified. Contact support to change PAN or GSTIN.</Alert>}
      {inReview && <Alert tone="warn" title="Under review">The StayShare team is verifying your documents. This usually takes 1–2 working days.</Alert>}
      {state.kycStatus === "REJECTED" && <Alert tone="error" title="KYC not approved">{state.kycNotes ?? "Please correct your details and resubmit."}</Alert>}
      {state.kycStatus === "NOT_SUBMITTED" && <Alert tone="info" title="Verify your business">Complete KYC to go live and receive payouts. Your PAN is stored encrypted — we only display its last 4 characters.</Alert>}

      <section className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> Business details <StatusBadge status={state.kycStatus} />
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business / legal name" required>
            {(p) => <Input {...p} value={v.businessName} onChange={(e) => setV({ ...v, businessName: e.target.value })} maxLength={120} />}
          </Field>
          <Field label="Business type">
            {(p) => (
              <Select {...p} value={v.businessType} onChange={(e) => setV({ ...v, businessType: e.target.value })}>
                <option value="">Select</option>
                {["Individual", "Proprietorship", "Partnership", "LLP", "Private Limited", "Trust / Society"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="GSTIN" hint="Optional if you're not GST-registered">
            {(p) => <Input {...p} value={v.gstin} disabled={locked} onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase() })} maxLength={15} placeholder="36ABCDE1234F1Z5" />}
          </Field>
          <Field label="PAN" required={!state.panLast4} hint={state.panLast4 ? `On file: ••••••${state.panLast4}. Enter a new PAN only to replace it.` : "Stored encrypted"}>
            {(p) => <Input {...p} value={v.pan} disabled={locked} onChange={(e) => setV({ ...v, pan: e.target.value.toUpperCase() })} maxLength={10} placeholder={state.panLast4 ? `••••••${state.panLast4}` : "ABCDE1234F"} autoComplete="off" />}
          </Field>
          <Field label="Registered address" required className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} maxLength={300} />}
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" loading={pending === "save"} onClick={() => valid() && run("save", () => call("/api/owner/kyc", "PUT", payload(false)), { success: "Details saved" })}>
            Save
          </Button>
          {!locked && !inReview && (
            <Button onClick={() => valid() && setConfirm(true)} disabled={!docs.length}>
              Submit for verification
            </Button>
          )}
        </div>
        {!docs.length && !locked && <p className="mt-2 text-right text-xs text-slate-500">Upload at least one KYC document to submit.</p>}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-base font-semibold">KYC documents</h2>
        {!locked && (
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr] lg:items-start">
            <Field label="Document type">
              {(p) => (
                <Select {...p} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {KYC_DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Document number (optional)" hint="Encrypted; only last 4 shown">
              {(p) => <Input {...p} value={docNo} onChange={(e) => setDocNo(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" />}
            </Field>
            <Uploader
              purpose="KYC"
              multiple={false}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              label="Upload document"
              onUploaded={async (f) => {
                await call("/api/owner/kyc/documents", "POST", { fileId: f.id, docType, number: docNo });
                setDocNo("");
              }}
            />
          </div>
        )}
        {docs.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No documents uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-400" aria-hidden />
                  <div>
                    {d.fileId ? (
                      <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
                        {KYC_DOC_TYPES.find((k) => k.value === d.docType)?.label ?? humanize(d.docType)}
                      </a>
                    ) : (
                      <span className="text-sm font-medium">{humanize(d.docType)}</span>
                    )}
                    <p className="text-xs text-slate-500">
                      {d.numberLast4 ? `••••${d.numberLast4} · ` : ""}
                      {new Date(d.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={d.status} />
                  {d.status !== "APPROVED" && !locked && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label="Remove document" onClick={() => setDel(d)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit KYC for verification?"
        description="You can't edit PAN or GSTIN while the StayShare team reviews your documents."
        confirmText="Submit"
        loading={pending === "submit"}
        onConfirm={async () => {
          await run("submit", () => call("/api/owner/kyc", "PUT", payload(true)), { success: "KYC submitted for verification" });
          setConfirm(false);
        }}
      />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title="Remove this document?"
        tone="danger"
        confirmText="Remove"
        loading={pending === "del"}
        onConfirm={async () => {
          await run("del", () => call(`/api/owner/kyc/documents/${del!.id}`, "DELETE"), { success: "Document removed" });
          setDel(null);
        }}
      />
    </div>
  );
}

export type BankState = { bankAccountName: string | null; bankAccountLast4: string | null; bankIfsc: string | null; bankName: string | null; upiId: string | null; bankVerified: boolean };

export function BankForm({ state }: { state: BankState }) {
  const [v, setV] = useState({ bankAccountName: state.bankAccountName ?? "", accountNumber: "", confirmNumber: "", bankIfsc: state.bankIfsc ?? "", bankName: state.bankName ?? "", upiId: state.upiId ?? "" });
  const [pw, setPw] = useState("");
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  const hasAny = state.bankAccountLast4 || state.upiId;
  const check = () => {
    if (v.accountNumber && !/^\d{9,18}$/.test(v.accountNumber)) return toast.error("Account number must be 9–18 digits"), false;
    if (v.accountNumber !== v.confirmNumber) return toast.error("Account numbers don't match"), false;
    if ((v.accountNumber || state.bankAccountLast4) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.bankIfsc)) return toast.error("Enter a valid IFSC (e.g. HDFC0001234)"), false;
    if (v.upiId && !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(v.upiId)) return toast.error("Enter a valid UPI ID"), false;
    if (!v.accountNumber && !state.bankAccountLast4 && !v.upiId) return toast.error("Add a bank account or UPI ID"), false;
    return true;
  };
  return (
    <div className="space-y-6">
      {hasAny && (
        <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">Current payout account</p>
            <p className="font-semibold">{state.bankAccountLast4 ? `${state.bankName ?? "Bank"} ••••${state.bankAccountLast4} · ${state.bankIfsc}` : "No bank account"}</p>
            {state.upiId && <p className="text-sm text-slate-600">UPI: {state.upiId}</p>}
          </div>
          <StatusBadge status={state.bankVerified ? "APPROVED" : "PENDING"} />
        </section>
      )}
      <Alert tone="info">Changing any detail resets verification — payouts pause until the StayShare finance team re-verifies the account.</Alert>
      <section className="card p-5">
        <h2 className="mb-4 text-base font-semibold">{hasAny ? "Update payout details" : "Add payout details"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account holder name">
            {(p) => <Input {...p} value={v.bankAccountName} onChange={(e) => setV({ ...v, bankAccountName: e.target.value })} maxLength={120} />}
          </Field>
          <Field label="Bank name">
            {(p) => <Input {...p} value={v.bankName} onChange={(e) => setV({ ...v, bankName: e.target.value })} maxLength={80} />}
          </Field>
          <Field label="Account number" hint={state.bankAccountLast4 ? `On file ••••${state.bankAccountLast4}. Leave blank to keep.` : "Stored encrypted"}>
            {(p) => <Input {...p} inputMode="numeric" value={v.accountNumber} onChange={(e) => setV({ ...v, accountNumber: e.target.value.replace(/\D/g, "") })} maxLength={18} autoComplete="off" />}
          </Field>
          <Field label="Confirm account number">
            {(p) => <Input {...p} inputMode="numeric" value={v.confirmNumber} onChange={(e) => setV({ ...v, confirmNumber: e.target.value.replace(/\D/g, "") })} maxLength={18} autoComplete="off" onPaste={(e) => e.preventDefault()} />}
          </Field>
          <Field label="IFSC">
            {(p) => <Input {...p} value={v.bankIfsc} onChange={(e) => setV({ ...v, bankIfsc: e.target.value.toUpperCase() })} maxLength={11} placeholder="HDFC0001234" />}
          </Field>
          <Field label="UPI ID" hint="Used when no verified bank account is available">
            {(p) => <Input {...p} value={v.upiId} onChange={(e) => setV({ ...v, upiId: e.target.value.trim() })} placeholder="name@bank" />}
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => check() && setOpen(true)}>Save payout details</Button>
        </div>
      </section>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm with your password"
        description="For your security, re-enter your account password to change payout details."
        confirmText="Save"
        loading={pending === "b"}
        onConfirm={async () => {
          const r = await run("b", () => call<{ verificationReset: boolean }>("/api/owner/bank", "PUT", { bankAccountName: v.bankAccountName, accountNumber: v.accountNumber, bankIfsc: v.bankIfsc, bankName: v.bankName, upiId: v.upiId, currentPassword: pw }));
          if (r) {
            toast.success(r.verificationReset ? "Saved — verification pending" : "Saved");
            setOpen(false);
            setPw("");
            setV((s) => ({ ...s, accountNumber: "", confirmNumber: "" }));
          }
        }}
      >
        <label htmlFor="bank-pw" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <Input id="bank-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      </ConfirmDialog>
    </div>
  );
}

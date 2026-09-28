"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert, Button, Card, CardBody, LinkButton } from "@/components/ui";
import { BasicInfoFields, EMPTY_PROPERTY, LocationFields, PolicyFields, toPayload, validateSection } from "./property-form";
import { DocumentsManager, FacilitiesEditor, PhotosManager, RulesEditor } from "./property-assets";
import { SubmitForReviewButton } from "./property-actions";
import type { DocItem, ImageItem, PropertyInfo, PropertyMeta } from "./types";

export const WIZARD_STEPS = [
  { key: "basic", label: "Basic info" },
  { key: "location", label: "Location & policies" },
  { key: "facilities", label: "Facilities" },
  { key: "rules", label: "House rules" },
  { key: "photos", label: "Photos" },
  { key: "documents", label: "Documents" },
  { key: "rooms", label: "Floors, rooms & beds" },
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

type Props = {
  meta: PropertyMeta;
  step: WizardStep;
  property?: PropertyInfo & { id: string; approvalStatus: string };
  facilitySel?: { facilityId: string; status: string }[];
  customFacilities?: { id: string; name: string; status: string }[];
  rules?: string[];
  images?: ImageItem[];
  docs?: DocItem[];
  roomCount?: number;
  bedCount?: number;
};

export function PropertyWizard(props: Props) {
  const { meta, property } = props;
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(props.step);
  const [value, setValue] = useState<PropertyInfo>(property ?? EMPTY_PROPERTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const idx = WIZARD_STEPS.findIndex((s) => s.key === step);
  const patch = (p: Partial<PropertyInfo>) => {
    setValue((v) => ({ ...v, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const go = (s: WizardStep) => {
    setStep(s);
    if (property) router.replace(`/owner/properties/${property.id}/setup?step=${s}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveInfo = async (section: "basic" | "location") => {
    const e = validateSection(section, value);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    if (section === "basic" && !property) return go("location");
    setSaving(true);
    try {
      if (!property) {
        const all = { ...validateSection("basic", value), ...e };
        if (Object.keys(all).length) {
          setErrors(all);
          setStep("basic");
          return;
        }
        const res = await apiFetch<{ id: string }>("/api/owner/properties", { method: "POST", json: toPayload(value) });
        toast.success("Draft created — now add facilities, photos and rooms");
        router.push(`/owner/properties/${res.id}/setup?step=facilities`);
        return;
      }
      const res = await apiFetch<{ needsReview: boolean }>(`/api/owner/properties/${property.id}`, { method: "PATCH", json: toPayload(value) });
      toast.success(res.needsReview ? "Saved — the StayShare team will review the changed details" : "Saved");
      router.refresh();
      go(section === "basic" ? "location" : "facilities");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const locked = !property && idx > 1;
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Setup steps" className="lg:sticky lg:top-20 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 scrollbar-none lg:flex-col lg:overflow-visible">
          {WIZARD_STEPS.map((s, i) => {
            const disabled = !property && i > 1;
            const done = i < idx;
            return (
              <li key={s.key} className="shrink-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => (property ? go(s.key) : i <= 1 && (i === 0 || !Object.keys(validateSection("basic", value)).length) && go(s.key))}
                  aria-current={s.key === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    s.key === step ? "bg-brand-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold", s.key === step ? "bg-white/20" : done ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500")}>{done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!property && <p className="mt-3 hidden text-xs text-slate-500 lg:block">Your property is saved as a draft after step 2. You can finish the rest any time.</p>}
      </nav>

      <Card>
        <CardBody className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Step {idx + 1} of {WIZARD_STEPS.length}
            </p>
            <h2 className="text-xl font-semibold">{WIZARD_STEPS[idx]!.label}</h2>
          </div>
          {locked && <Alert tone="info">Complete the first two steps to create your draft.</Alert>}

          {step === "basic" && <BasicInfoFields value={value} onChange={patch} meta={meta} errors={errors} />}
          {step === "location" && (
            <div className="space-y-8">
              <LocationFields value={value} onChange={patch} meta={meta} errors={errors} />
              <div>
                <h3 className="mb-3 text-base font-semibold">Stay policies</h3>
                <PolicyFields value={value} onChange={patch} errors={errors} />
              </div>
              <Alert tone="info" title="Prices are set by the StayShare team">
                You don&apos;t need to enter any prices. Once your rooms are approved, our pricing team sets the customer price plan — you&apos;ll see it under each room&apos;s Pricing tab.
              </Alert>
            </div>
          )}
          {property && step === "facilities" && <FacilitiesEditor propertyId={property.id} facilities={meta.facilities} selected={props.facilitySel ?? []} custom={props.customFacilities ?? []} />}
          {property && step === "rules" && <RulesEditor propertyId={property.id} rules={props.rules ?? []} />}
          {property && step === "photos" && <PhotosManager propertyId={property.id} images={props.images ?? []} approvedProperty={property.approvalStatus === "APPROVED"} />}
          {property && step === "documents" && <DocumentsManager propertyId={property.id} docs={props.docs ?? []} />}
          {property && step === "rooms" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                You have <strong>{props.roomCount ?? 0} rooms</strong> and <strong>{props.bedCount ?? 0} beds</strong> set up. Add floors, then rooms — beds are created automatically from each room&apos;s sharing capacity.
              </p>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/owner/properties/${property.id}?tab=floors`} variant="outline">
                  Manage floors
                </LinkButton>
                <LinkButton href={`/owner/properties/${property.id}?tab=rooms`} variant="primary">
                  Manage rooms & beds
                </LinkButton>
              </div>
              {["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(property.approvalStatus) ? (
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                  <p className="font-semibold text-brand-900">Ready to go live?</p>
                  <p className="mb-3 text-sm text-brand-800">Submit your property for review. The StayShare team verifies details and documents, then sets prices for each room.</p>
                  <SubmitForReviewButton propertyId={property.id} disabled={!props.roomCount || !(props.images ?? []).length} />
                  {(!props.roomCount || !(props.images ?? []).length) && <p className="mt-2 text-xs text-brand-800">Add at least one photo and one room first.</p>}
                </div>
              ) : (
                <Alert tone="success">This property has been submitted. You can keep editing — new items go to review automatically.</Alert>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            {idx > 0 ? (
              <Button variant="ghost" onClick={() => go(WIZARD_STEPS[idx - 1]!.key)}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <Link href="/owner/properties" className="text-sm text-slate-500 hover:underline">
                Cancel
              </Link>
            )}
            {step === "basic" || step === "location" ? (
              <Button onClick={() => saveInfo(step)} loading={saving}>
                {!property && step === "location" ? "Create draft & continue" : "Save & continue"} <ChevronRight className="h-4 w-4" />
              </Button>
            ) : idx < WIZARD_STEPS.length - 1 ? (
              <Button variant="outline" onClick={() => go(WIZARD_STEPS[idx + 1]!.key)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              property && (
                <LinkButton href={`/owner/properties/${property.id}`} variant="outline">
                  Go to property
                </LinkButton>
              )
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

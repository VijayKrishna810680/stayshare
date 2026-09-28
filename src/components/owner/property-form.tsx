"use client";
import { useMemo, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { propertyBasicSchema, propertyLocationSchema, propertyPolicySchema } from "./schemas";
import { AUDIENCE_OPTIONS, GENDER_OPTIONS } from "./format";
import { Toggle } from "./common";
import type { PropertyInfo, PropertyMeta } from "./types";

export const EMPTY_PROPERTY: PropertyInfo = {
  name: "",
  propertyTypeId: "",
  description: "",
  genderEligibility: "ANY",
  targetAudience: [],
  addressLine: "",
  landmark: "",
  cityId: "",
  localityId: null,
  state: "",
  postalCode: "",
  latitude: null,
  longitude: null,
  checkInTime: "12:00",
  checkOutTime: "11:00",
  minStayNights: 1,
  maxStayNights: 365,
  idProofRequired: true,
  instantBooking: true,
  allowCashAtProperty: false,
  foodIncluded: false,
  contactPhone: "",
  showOwnerPhone: false,
};

type Errors = Record<string, string | undefined>;

function zodErrors(res: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }): Errors {
  const out: Errors = {};
  if (!res.success) for (const i of res.error!.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

export function validateSection(section: "basic" | "location", v: PropertyInfo): Errors {
  if (section === "basic") return zodErrors(propertyBasicSchema.safeParse(v));
  const e = { ...zodErrors(propertyLocationSchema.safeParse({ ...v, landmark: v.landmark || null })), ...zodErrors(propertyPolicySchema.safeParse({ ...v, contactPhone: v.contactPhone || null })) };
  if (v.maxStayNights < v.minStayNights) e.maxStayNights = "Maximum stay must be at least the minimum stay";
  return e;
}

export function toPayload(v: PropertyInfo) {
  return {
    name: v.name,
    propertyTypeId: v.propertyTypeId,
    description: v.description,
    genderEligibility: v.genderEligibility,
    targetAudience: v.targetAudience,
    addressLine: v.addressLine,
    landmark: v.landmark || null,
    cityId: v.cityId,
    localityId: v.localityId || null,
    state: v.state,
    postalCode: v.postalCode,
    latitude: v.latitude,
    longitude: v.longitude,
    checkInTime: v.checkInTime,
    checkOutTime: v.checkOutTime,
    minStayNights: v.minStayNights,
    maxStayNights: v.maxStayNights,
    idProofRequired: v.idProofRequired,
    instantBooking: v.instantBooking,
    allowCashAtProperty: v.allowCashAtProperty,
    foodIncluded: v.foodIncluded,
    contactPhone: v.contactPhone || null,
    showOwnerPhone: v.showOwnerPhone,
  };
}

export function BasicInfoFields({ value, onChange, meta, errors }: { value: PropertyInfo; onChange: (p: Partial<PropertyInfo>) => void; meta: PropertyMeta; errors: Errors }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Property name" required error={errors.name} className="sm:col-span-2">
        {(p) => <Input {...p} value={value.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Green Leaf Co-Living" maxLength={120} />}
      </Field>
      <Field label="Property type" required error={errors.propertyTypeId}>
        {(p) => (
          <Select {...p} value={value.propertyTypeId} onChange={(e) => onChange({ propertyTypeId: e.target.value })}>
            <option value="">Select a type</option>
            {meta.propertyTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Who can stay" required error={errors.genderEligibility}>
        {(p) => (
          <Select {...p} value={value.genderEligibility} onChange={(e) => onChange({ genderEligibility: e.target.value })}>
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Description" required error={errors.description} hint={`${value.description.length}/5000 — mention the vibe, nearby offices/colleges, food and house style.`} className="sm:col-span-2">
        {(p) => <Textarea {...p} rows={5} value={value.description} onChange={(e) => onChange({ description: e.target.value })} maxLength={5000} />}
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium text-slate-700">Best suited for</legend>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_OPTIONS.map((a) => {
            const on = value.targetAudience.includes(a.value);
            return (
              <button
                key={a.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ targetAudience: on ? value.targetAudience.filter((x) => x !== a.value) : [...value.targetAudience, a.value] })}
                className={on ? "rounded-full border border-brand-600 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800" : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function LocationFields({ value, onChange, meta, errors }: { value: PropertyInfo; onChange: (p: Partial<PropertyInfo>) => void; meta: PropertyMeta; errors: Errors }) {
  const locs = useMemo(() => meta.localities.filter((l) => l.cityId === value.cityId), [meta.localities, value.cityId]);
  const [locating, setLocating] = useState(false);
  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return toast.error("Location is not available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ latitude: Math.round(pos.coords.latitude * 1e6) / 1e6, longitude: Math.round(pos.coords.longitude * 1e6) / 1e6 });
        setLocating(false);
        toast.success("Location captured — check the map preview");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === 1 ? "Location permission denied" : "Couldn't get your location");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const lat = value.latitude;
  const lng = value.longitude;
  const d = 0.006;
  const mapSrc = lat != null && lng != null ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}` : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Street address" required error={errors.addressLine} className="sm:col-span-2">
        {(p) => <Input {...p} value={value.addressLine} onChange={(e) => onChange({ addressLine: e.target.value })} placeholder="Building, street, area" />}
      </Field>
      <Field label="Landmark" error={errors.landmark}>
        {(p) => <Input {...p} value={value.landmark ?? ""} onChange={(e) => onChange({ landmark: e.target.value })} placeholder="Near metro station…" />}
      </Field>
      <Field label="City" required error={errors.cityId}>
        {(p) => (
          <Select
            {...p}
            value={value.cityId}
            onChange={(e) => {
              const c = meta.cities.find((x) => x.id === e.target.value);
              onChange({ cityId: e.target.value, localityId: null, state: c?.state ?? value.state, ...(value.latitude == null && c?.latitude != null ? { latitude: c.latitude, longitude: c.longitude } : {}) });
            }}
          >
            <option value="">Select a city</option>
            {meta.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Locality" error={errors.localityId} hint={value.cityId && !locs.length ? "No localities listed for this city yet" : undefined}>
        {(p) => (
          <Select {...p} value={value.localityId ?? ""} onChange={(e) => onChange({ localityId: e.target.value || null })} disabled={!value.cityId}>
            <option value="">{value.cityId ? "Select a locality" : "Pick a city first"}</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="State" required error={errors.state}>
        {(p) => <Input {...p} value={value.state} onChange={(e) => onChange({ state: e.target.value })} />}
      </Field>
      <Field label="PIN code" required error={errors.postalCode}>
        {(p) => <Input {...p} inputMode="numeric" maxLength={6} value={value.postalCode} onChange={(e) => onChange({ postalCode: e.target.value.replace(/\D/g, "") })} />}
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Latitude" error={errors.latitude}>
          {(p) => <Input {...p} type="number" step="any" value={lat ?? ""} onChange={(e) => onChange({ latitude: e.target.value === "" ? null : Number(e.target.value) })} />}
        </Field>
        <Field label="Longitude" error={errors.longitude}>
          {(p) => <Input {...p} type="number" step="any" value={lng ?? ""} onChange={(e) => onChange({ longitude: e.target.value === "" ? null : Number(e.target.value) })} />}
        </Field>
        <Button type="button" variant="outline" onClick={useMyLocation} loading={locating} className="col-span-2 sm:col-span-1">
          <LocateFixed className="h-4 w-4" /> Use my location
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 sm:col-span-2">
        {mapSrc ? (
          <iframe title="Map preview of the property location" src={mapSrc} className="h-56 w-full" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="grid h-40 place-items-center bg-slate-50 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Add coordinates to preview the map pin
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PolicyFields({ value, onChange, errors }: { value: PropertyInfo; onChange: (p: Partial<PropertyInfo>) => void; errors: Errors }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Check-in time" error={errors.checkInTime}>
        {(p) => <Input {...p} type="time" value={value.checkInTime} onChange={(e) => onChange({ checkInTime: e.target.value })} />}
      </Field>
      <Field label="Check-out time" error={errors.checkOutTime}>
        {(p) => <Input {...p} type="time" value={value.checkOutTime} onChange={(e) => onChange({ checkOutTime: e.target.value })} />}
      </Field>
      <Field label="Minimum stay (nights)" error={errors.minStayNights}>
        {(p) => <Input {...p} type="number" min={1} max={365} value={value.minStayNights} onChange={(e) => onChange({ minStayNights: Number(e.target.value) || 1 })} />}
      </Field>
      <Field label="Maximum stay (nights)" error={errors.maxStayNights}>
        {(p) => <Input {...p} type="number" min={1} max={1095} value={value.maxStayNights} onChange={(e) => onChange({ maxStayNights: Number(e.target.value) || 1 })} />}
      </Field>
      <Field label="Front-desk phone" error={errors.contactPhone} hint="Shown to confirmed guests only">
        {(p) => <Input {...p} type="tel" value={value.contactPhone ?? ""} onChange={(e) => onChange({ contactPhone: e.target.value })} placeholder="+91…" />}
      </Field>
      <div className="flex items-end pb-2">
        <Checkbox label="Show my phone to confirmed guests" checked={value.showOwnerPhone} onChange={(e) => onChange({ showOwnerPhone: e.target.checked })} />
      </div>
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        <Toggle label="ID proof required at check-in" checked={value.idProofRequired} onChange={(v) => onChange({ idProofRequired: v })} description="Recommended — required by law for most stays" />
        <Toggle label="Instant booking" checked={value.instantBooking} onChange={(v) => onChange({ instantBooking: v })} description="Guests are confirmed as soon as they pay" />
        <Toggle label="Request: allow pay at property (cash)" checked={value.allowCashAtProperty} onChange={(v) => onChange({ allowCashAtProperty: v })} description="Subject to StayShare approval" />
        <Toggle label="Food included" checked={value.foodIncluded} onChange={(v) => onChange({ foodIncluded: v })} description="Meals are part of the stay" />
      </div>
    </div>
  );
}

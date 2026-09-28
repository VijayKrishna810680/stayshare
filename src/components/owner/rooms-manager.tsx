"use client";
import { useState } from "react";
import { BedDouble, Camera, Layers, Pencil, Plus, Snowflake, Trash2 } from "lucide-react";
import { Badge, Button, Checkbox, EmptyState, Field, Input, Select, StatusBadge, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Img } from "@/components/ui/img";
import { toast } from "sonner";
import { call, useAction } from "./common";
import { BED_TYPES, GENDER_OPTIONS, ROOM_CATEGORIES, humanize } from "./format";
import { roomSchema } from "./schemas";
import { Uploader } from "./property-assets";
import type { FacilityOpt } from "./types";

// ───────────────────────────── floors ─────────────────────────────

export type FloorRow = { id: string; number: number; name: string | null; rooms: number };

export function FloorsManager({ propertyId, floors }: { propertyId: string; floors: FloorRow[] }) {
  const { run, pending } = useAction();
  const [edit, setEdit] = useState<{ id?: string; number: string; name: string } | null>(null);
  const [del, setDel] = useState<FloorRow | null>(null);
  const save = async () => {
    const n = Number(edit!.number);
    if (!Number.isInteger(n)) return toast.error("Enter a floor number (0 for ground)");
    const body = { number: n, name: edit!.name || null };
    const r = await run("save", () => (edit!.id ? call(`/api/owner/floors/${edit!.id}`, "PATCH", body) : call(`/api/owner/properties/${propertyId}/floors`, "POST", body)), { success: edit!.id ? "Floor updated" : "Floor added" });
    if (r) setEdit(null);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ number: String(floors.length ? Math.max(...floors.map((f) => f.number)) + 1 : 0), name: "" })}>
          <Plus className="h-4 w-4" /> Add floor
        </Button>
      </div>
      {floors.length === 0 ? (
        <EmptyState icon={<Layers className="h-6 w-6" />} title="No floors yet" description="Add floors (0 = ground floor) so rooms can be organised by level." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Floor</TH>
              <TH>Name</TH>
              <TH>Rooms</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {floors.map((f) => (
              <TR key={f.id}>
                <TD className="font-medium">{f.number}</TD>
                <TD>{f.name ?? "—"}</TD>
                <TD>{f.rooms}</TD>
                <TD className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: f.id, number: String(f.number), name: f.name ?? "" })}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDel(f)} disabled={f.rooms > 0} title={f.rooms > 0 ? "Move rooms off this floor first" : undefined}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit floor" : "Add floor"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending === "save"}>
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Floor number" required hint="0 = ground floor, -1 = basement">
              {(p) => <Input {...p} type="number" value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} />}
            </Field>
            <Field label="Name (optional)">
              {(p) => <Input {...p} value={edit.name} placeholder="e.g. Ground floor" onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} />}
            </Field>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete floor ${del?.number}?`} confirmText="Delete" tone="danger" loading={pending === "del"} onConfirm={async () => {
        await run("del", () => call(`/api/owner/floors/${del!.id}`, "DELETE"), { success: "Floor deleted" });
        setDel(null);
      }} />
    </div>
  );
}

// ───────────────────────────── rooms ─────────────────────────────

export type RoomRow = {
  id: string;
  roomNumber: string;
  name: string | null;
  floorId: string | null;
  floorLabel: string | null;
  category: string;
  sharingCapacity: number;
  totalBeds: number;
  maxOccupancy: number;
  isAC: boolean;
  bathroom: string;
  furnishing: string;
  genderEligibility: string;
  sizeSqft: number | null;
  description: string | null;
  allowBedBooking: boolean;
  allowEntireRoomBooking: boolean;
  approvalStatus: string;
  approvalNotes: string | null;
  maintenanceStatus: string;
  cleaningStatus: string;
  facilityIds: string[];
  images: { id: string; url: string; status: string }[];
  hasPrice: boolean;
};

type RoomForm = Omit<RoomRow, "id" | "floorLabel" | "totalBeds" | "approvalStatus" | "approvalNotes" | "maintenanceStatus" | "cleaningStatus" | "images" | "hasPrice"> & { bedType: string };

const BLANK_ROOM: RoomForm = { roomNumber: "", name: "", floorId: null, category: "SHARED", sharingCapacity: 2, maxOccupancy: 2, isAC: false, bathroom: "ATTACHED", furnishing: "FURNISHED", genderEligibility: "ANY", sizeSqft: null, description: "", allowBedBooking: true, allowEntireRoomBooking: true, facilityIds: [], bedType: "SINGLE" };

export function RoomsManager({ propertyId, rooms, floors, facilities, propertyApproved }: { propertyId: string; rooms: RoomRow[]; floors: FloorRow[]; facilities: FacilityOpt[]; propertyApproved: boolean }) {
  const { run, pending } = useAction();
  const [form, setForm] = useState<(RoomForm & { id?: string }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [del, setDel] = useState<RoomRow | null>(null);
  const [photos, setPhotos] = useState<RoomRow | null>(null);
  const roomFacilities = facilities.filter((f) => f.active && f.category === "ROOM");
  const open = (r?: RoomRow) => {
    setErrors({});
    setForm(r ? { ...r, name: r.name ?? "", description: r.description ?? "", bedType: "SINGLE" } : { ...BLANK_ROOM, floorId: floors[0]?.id ?? null, genderEligibility: "ANY" });
  };
  const set = (p: Partial<RoomForm>) => setForm((f) => (f ? { ...f, ...p } : f));
  const save = async () => {
    const f = form!;
    const payload = { ...f, name: f.name || null, description: f.description || null, sizeSqft: f.sizeSqft || null, floorId: f.floorId || null, bedType: f.bedType as (typeof BED_TYPES)[number] };
    delete (payload as { id?: string }).id;
    const res = roomSchema.safeParse(payload);
    if (!res.success) {
      const e: Record<string, string> = {};
      for (const i of res.error.issues) e[String(i.path[0])] ??= i.message;
      setErrors(e);
      return toast.error("Please fix the highlighted fields");
    }
    const out = await run("save", () => (f.id ? call<{ reReview: boolean }>(`/api/owner/rooms/${f.id}`, "PATCH", payload) : call(`/api/owner/properties/${propertyId}/rooms`, "POST", payload)), {
      success: f.id ? "Room updated" : `Room ${f.roomNumber} added with ${f.sharingCapacity} bed(s)`,
    });
    if (out) {
      if (f.id && (out as { reReview?: boolean }).reReview) toast.info("These changes need StayShare re-approval — the room is hidden from search until then.");
      setForm(null);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">{propertyApproved ? "New rooms go to StayShare for review and pricing before guests can book them." : "Rooms are submitted together with the property."}</p>
        <Button onClick={() => open()}>
          <Plus className="h-4 w-4" /> Add room
        </Button>
      </div>
      {rooms.length === 0 ? (
        <EmptyState icon={<BedDouble className="h-6 w-6" />} title="No rooms yet" description="Add each room with its sharing type — beds are created automatically." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Room</TH>
              <TH>Type</TH>
              <TH>Beds</TH>
              <TH>Features</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {rooms.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p className="font-medium">
                    {r.roomNumber} {r.name && <span className="font-normal text-slate-500">· {r.name}</span>}
                  </p>
                  <p className="text-xs text-slate-500">{r.floorLabel ?? "No floor"}</p>
                </TD>
                <TD>
                  {humanize(r.category)}
                  <p className="text-xs text-slate-500">{r.category === "FAMILY" ? `Up to ${r.maxOccupancy} guests` : `${r.sharingCapacity}-sharing`}</p>
                </TD>
                <TD>{r.totalBeds}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {r.isAC ? (
                      <Badge tone="blue">
                        <Snowflake className="h-3 w-3" /> AC
                      </Badge>
                    ) : (
                      <Badge>Non-AC</Badge>
                    )}
                    <Badge>{humanize(r.bathroom)} bath</Badge>
                    {r.allowBedBooking && <Badge tone="brand">Beds</Badge>}
                    {r.allowEntireRoomBooking && <Badge tone="brand">Entire room</Badge>}
                  </div>
                </TD>
                <TD>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={r.approvalStatus} />
                    {!r.hasPrice && <span className="text-xs text-amber-700">Awaiting pricing by StayShare team</span>}
                    {r.maintenanceStatus !== "OK" && <StatusBadge status={r.maintenanceStatus} />}
                    {r.approvalNotes && ["CHANGES_REQUESTED", "REJECTED"].includes(r.approvalStatus) && <span className="text-xs text-purple-700">{r.approvalNotes}</span>}
                  </div>
                </TD>
                <TD className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setPhotos(r)} aria-label={`Photos of room ${r.roomNumber}`}>
                    <Camera className="h-4 w-4" /> {r.images.length}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => open(r)} aria-label={`Edit room ${r.roomNumber}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDel(r)} aria-label={`Delete room ${r.roomNumber}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? `Edit room ${form.roomNumber}` : "Add room"}
        description="No price fields — StayShare sets prices after review."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending === "save"}>
              {form?.id ? "Save room" : "Create room & beds"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room number" required error={errors.roomNumber}>
              {(p) => <Input {...p} value={form.roomNumber} onChange={(e) => set({ roomNumber: e.target.value.toUpperCase() })} placeholder="101" maxLength={20} />}
            </Field>
            <Field label="Floor" error={errors.floorId} hint={!floors.length ? "Add floors in the Floors tab" : undefined}>
              {(p) => (
                <Select {...p} value={form.floorId ?? ""} onChange={(e) => set({ floorId: e.target.value || null })}>
                  <option value="">No floor</option>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name ?? `Floor ${f.number}`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Room name (optional)" error={errors.name}>
              {(p) => <Input {...p} value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Deluxe twin sharing" maxLength={80} />}
            </Field>
            <Field label="Category" required error={errors.category}>
              {(p) => (
                <Select
                  {...p}
                  value={form.category}
                  onChange={(e) => {
                    const c = e.target.value;
                    set({ category: c, ...(c === "PRIVATE" ? { sharingCapacity: 1, maxOccupancy: Math.max(form.maxOccupancy, 2), allowBedBooking: false, allowEntireRoomBooking: true } : c === "FAMILY" ? { allowBedBooking: false, allowEntireRoomBooking: true, genderEligibility: "FAMILY" } : { allowBedBooking: true }) });
                  }}
                >
                  {ROOM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {humanize(c)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={form.category === "FAMILY" ? "Beds in room" : "Sharing capacity (beds)"} required error={errors.sharingCapacity} hint={form.id ? "Add/remove beds in the Beds tab" : "This many beds are created automatically"}>
              {(p) => (
                <Select {...p} value={form.sharingCapacity} onChange={(e) => { const n = Number(e.target.value); set({ sharingCapacity: n, maxOccupancy: Math.max(n, form.category === "FAMILY" ? form.maxOccupancy : n) }); }}>
                  {Array.from({ length: form.category === "DORMITORY" ? 12 : 6 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} {form.category === "FAMILY" ? "" : i === 0 ? "(single)" : "sharing"}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Max occupancy (guests)" required error={errors.maxOccupancy}>
              {(p) => <Input {...p} type="number" min={1} max={20} value={form.maxOccupancy} onChange={(e) => set({ maxOccupancy: Number(e.target.value) || 1 })} />}
            </Field>
            {!form.id && (
              <Field label="Bed type">
                {(p) => (
                  <Select {...p} value={form.bedType} onChange={(e) => set({ bedType: e.target.value })}>
                    {BED_TYPES.map((b) => (
                      <option key={b} value={b}>
                        {humanize(b)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label="Air conditioning">
              {(p) => (
                <Select {...p} value={form.isAC ? "1" : "0"} onChange={(e) => set({ isAC: e.target.value === "1" })}>
                  <option value="1">AC</option>
                  <option value="0">Non-AC</option>
                </Select>
              )}
            </Field>
            <Field label="Bathroom">
              {(p) => (
                <Select {...p} value={form.bathroom} onChange={(e) => set({ bathroom: e.target.value })}>
                  <option value="ATTACHED">Attached</option>
                  <option value="COMMON">Common</option>
                </Select>
              )}
            </Field>
            <Field label="Furnishing">
              {(p) => (
                <Select {...p} value={form.furnishing} onChange={(e) => set({ furnishing: e.target.value })}>
                  <option value="FURNISHED">Furnished</option>
                  <option value="SEMI_FURNISHED">Semi-furnished</option>
                  <option value="UNFURNISHED">Unfurnished</option>
                </Select>
              )}
            </Field>
            <Field label="Who can stay">
              {(p) => (
                <Select {...p} value={form.genderEligibility} onChange={(e) => set({ genderEligibility: e.target.value })}>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Size (sq ft)" error={errors.sizeSqft}>
              {(p) => <Input {...p} type="number" min={20} value={form.sizeSqft ?? ""} onChange={(e) => set({ sizeSqft: e.target.value ? Number(e.target.value) : null })} />}
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <Checkbox label="Guests can book individual beds" checked={form.allowBedBooking} onChange={(e) => set({ allowBedBooking: e.target.checked })} />
              <Checkbox label="Guests can book the entire room" checked={form.allowEntireRoomBooking} onChange={(e) => set({ allowEntireRoomBooking: e.target.checked })} />
              {errors.allowBedBooking && <p className="text-xs text-red-600">{errors.allowBedBooking}</p>}
            </div>
            <Field label="Description" error={errors.description} className="sm:col-span-2">
              {(p) => <Textarea {...p} rows={3} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />}
            </Field>
            {roomFacilities.length > 0 && (
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-slate-700">Room facilities</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {roomFacilities.map((f) => (
                    <Checkbox key={f.id} label={f.name} checked={form.facilityIds.includes(f.id)} onChange={(e) => set({ facilityIds: e.target.checked ? [...form.facilityIds, f.id] : form.facilityIds.filter((x) => x !== f.id) })} />
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={!!photos} onClose={() => setPhotos(null)} title={`Room ${photos?.roomNumber} photos`} description="New photos are reviewed by StayShare before going live." size="lg">
        {photos && <RoomPhotos room={rooms.find((r) => r.id === photos.id) ?? photos} />}
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete room ${del?.roomNumber}?`}
        description="The room and its beds are removed from your listing. Rooms with current or upcoming bookings can't be deleted."
        confirmText="Delete room"
        tone="danger"
        loading={pending === "del"}
        onConfirm={async () => {
          await run("del", () => call(`/api/owner/rooms/${del!.id}`, "DELETE"), { success: "Room deleted" });
          setDel(null);
        }}
      />
    </div>
  );
}

function RoomPhotos({ room }: { room: RoomRow }) {
  const { run, pending } = useAction();
  return (
    <div className="space-y-4">
      <Uploader
        purpose="ROOM_IMAGE"
        accept="image/jpeg,image/png,image/webp"
        label="Add room photos"
        onUploaded={async (f) => {
          await call(`/api/owner/rooms/${room.id}/images`, "POST", { fileId: f.id });
        }}
      />
      {room.images.length === 0 ? (
        <p className="text-center text-sm text-slate-500">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {room.images.map((img) => (
            <li key={img.id} className="relative overflow-hidden rounded-xl border border-slate-200">
              <Img src={img.url} alt={`Room ${room.roomNumber}`} className="h-28 w-full" />
              <div className="absolute left-1 top-1">
                <StatusBadge status={img.status} />
              </div>
              <button
                type="button"
                className="absolute right-1 top-1 rounded-lg bg-white/90 p-1 text-red-600 shadow hover:bg-white"
                aria-label="Delete photo"
                disabled={pending === img.id}
                onClick={() => run(img.id, () => call(`/api/owner/rooms/${room.id}/images/${img.id}`, "DELETE"), { success: "Photo deleted" })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────── beds ─────────────────────────────

export type BedRow = { id: string; roomId: string; bedNumber: string; code: string; bedType: string; status: string; active: boolean; availableFrom: string | null };

export function BedsManager({ rooms, beds }: { rooms: { id: string; roomNumber: string; name: string | null; category: string }[]; beds: BedRow[] }) {
  const { run, pending } = useAction();
  const [add, setAdd] = useState<{ roomId: string; count: number; bedType: string; availableFrom: string } | null>(null);
  const [del, setDel] = useState<BedRow | null>(null);
  if (!rooms.length) return <EmptyState icon={<BedDouble className="h-6 w-6" />} title="Add a room first" description="Beds belong to rooms. Create rooms in the Rooms tab." />;
  return (
    <div className="space-y-5">
      {rooms.map((r) => {
        const list = beds.filter((b) => b.roomId === r.id);
        return (
          <section key={r.id} className="card">
            <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="font-semibold">
                  Room {r.roomNumber} {r.name && <span className="font-normal text-slate-500">· {r.name}</span>}
                </h3>
                <p className="text-xs text-slate-500">
                  {humanize(r.category)} · {list.filter((b) => b.active).length} active beds
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAdd({ roomId: r.id, count: 1, bedType: "SINGLE", availableFrom: "" })}>
                <Plus className="h-4 w-4" /> Add bed
              </Button>
            </header>
            {list.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No beds.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((b) => (
                  <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-[160px] items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">{b.bedNumber}</span>
                      <div>
                        <p className="text-sm font-medium">{b.code}</p>
                        <StatusBadge status={b.active ? b.status : "BLOCKED"} />
                      </div>
                    </div>
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:max-w-md">
                      <Select aria-label={`Bed type for ${b.code}`} value={b.bedType} onChange={(e) => run(`t-${b.id}`, () => call(`/api/owner/beds/${b.id}`, "PATCH", { bedType: e.target.value }), { success: "Bed type updated" })}>
                        {BED_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {humanize(t)}
                          </option>
                        ))}
                      </Select>
                      <Input aria-label={`Available from for ${b.code}`} type="date" defaultValue={b.availableFrom ?? ""} onBlur={(e) => e.target.value !== (b.availableFrom ?? "") && run(`d-${b.id}`, () => call(`/api/owner/beds/${b.id}`, "PATCH", { availableFrom: e.target.value || null }), { success: "Availability date saved" })} />
                    </div>
                    <div className="flex gap-1 sm:ml-auto">
                      <Button size="sm" variant="ghost" loading={pending === `a-${b.id}`} onClick={() => run(`a-${b.id}`, () => call(`/api/owner/beds/${b.id}`, "PATCH", { active: !b.active }), { success: b.active ? "Bed deactivated" : "Bed activated" })}>
                        {b.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDel(b)} aria-label={`Remove bed ${b.code}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <Dialog
        open={!!add}
        onClose={() => setAdd(null)}
        title="Add beds"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdd(null)}>
              Cancel
            </Button>
            <Button
              loading={pending === "add"}
              onClick={async () => {
                const r = await run("add", () => call(`/api/owner/rooms/${add!.roomId}/beds`, "POST", { count: add!.count, bedType: add!.bedType, availableFrom: add!.availableFrom || null }), { success: "Beds added" });
                if (r) setAdd(null);
              }}
            >
              Add
            </Button>
          </>
        }
      >
        {add && (
          <div className="space-y-3">
            <Field label="How many beds">
              {(p) => <Input {...p} type="number" min={1} max={12} value={add.count} onChange={(e) => setAdd({ ...add, count: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} />}
            </Field>
            <Field label="Bed type">
              {(p) => (
                <Select {...p} value={add.bedType} onChange={(e) => setAdd({ ...add, bedType: e.target.value })}>
                  {BED_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Available from (optional)">
              {(p) => <Input {...p} type="date" value={add.availableFrom} onChange={(e) => setAdd({ ...add, availableFrom: e.target.value })} />}
            </Field>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Remove bed ${del?.code}?`}
        description="Beds with upcoming bookings can't be removed."
        confirmText="Remove"
        tone="danger"
        loading={pending === "del"}
        onConfirm={async () => {
          await run("del", () => call(`/api/owner/beds/${del!.id}`, "DELETE"), { success: "Bed removed" });
          setDel(null);
        }}
      />
    </div>
  );
}

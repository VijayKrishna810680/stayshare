import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bath, Ruler, Snowflake, Users } from "lucide-react";
import { getPublicProperty, roomBedMap } from "@/lib/site/property";
import { CATEGORY_LABEL, GENDER_LABEL } from "@/lib/site/labels";
import { Breadcrumbs } from "@/components/ui";
import { Gallery } from "@/components/site/gallery";
import { BookingExperience } from "@/components/site/booking-experience";
import { FacilityIcon } from "@/components/site/facility-icon";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export async function generateMetadata({ params }: { params: Promise<{ slug: string; roomId: string }> }): Promise<Metadata> {
  const { slug, roomId } = await params;
  const p = await getPublicProperty(slug);
  const r = p?.rooms.find((x) => x.id === roomId);
  return { title: r && p ? `${r.name ?? `Room ${r.roomNumber}`} · ${p.name}` : "Room" };
}

export default async function RoomPage({ params, searchParams }: { params: Promise<{ slug: string; roomId: string }>; searchParams: Promise<SP> }) {
  const { slug, roomId } = await params;
  const sp = await searchParams;
  const checkIn = dateOk(one(sp.checkIn));
  const checkOut = dateOk(one(sp.checkOut));
  const p = await getPublicProperty(slug, { checkIn, checkOut });
  const room = p?.rooms.find((r) => r.id === roomId);
  if (!p || !room) notFound();
  const beds = await roomBedMap(room.id, checkIn, checkOut);
  const title = room.name ?? `${CATEGORY_LABEL[room.category]} · Room ${room.roomNumber}`;

  const overview = (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Users, label: "Occupancy", value: `${room.sharingCapacity === 1 ? "Single" : `${room.sharingCapacity}-sharing`} · up to ${room.maxOccupancy}` },
          { icon: Snowflake, label: "Cooling", value: room.isAC ? "Air-conditioned" : "Non-AC (fan)" },
          { icon: Bath, label: "Bathroom", value: room.bathroom === "ATTACHED" ? "Attached" : "Common" },
          { icon: Ruler, label: "Size", value: room.sizeSqft ? `${room.sizeSqft} sq ft` : room.furnishing.replace("_", "-").toLowerCase() },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-slate-200 bg-white p-3">
            <x.icon className="h-4 w-4 text-brand-600" aria-hidden />
            <p className="mt-1 text-xs text-slate-500">{x.label}</p>
            <p className="text-sm font-semibold capitalize">{x.value}</p>
          </div>
        ))}
      </div>
      {room.description && <p className="leading-7 text-slate-700">{room.description}</p>}
      <p className="text-sm text-slate-600">
        <span className="font-medium">Who can stay:</span> {GENDER_LABEL[room.gender] ?? room.gender} · {room.allowBedBooking && room.allowEntireRoomBooking ? "Book individual beds or the entire room" : room.allowBedBooking ? "Individual beds only" : "Entire room only"}
      </p>
      {room.facilities.length > 0 && (
        <div>
          <h2 className="text-lg font-bold">In this room</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {room.facilities.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
                <FacilityIcon name={f.icon} className="h-5 w-5 text-brand-600" /> {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: p.city.name, href: `/search?city=${p.city.slug}` }, { label: p.name, href: `/property/${p.slug}` }, { label: title }]} />
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">
        {p.name} · {[p.locality?.name, p.city.name].filter(Boolean).join(", ")}
      </p>
      <Gallery images={(room.images.length ? room.images : p.images.map((i) => i.url)).map((url) => ({ url, caption: null }))} name={title} />
      <div className="mt-8">
        <BookingExperience
          slug={p.slug}
          minStay={p.minStayNights}
          maxStay={p.maxStayNights}
          checkInTime={p.checkInTime}
          checkOutTime={p.checkOutTime}
          rooms={[room]}
          singleRoom
          beds={beds}
          initial={{ checkIn, checkOut, guests: Number(one(sp.guests) ?? 1) || 1, roomId: room.id }}
          overview={overview}
        />
      </div>
    </div>
  );
}

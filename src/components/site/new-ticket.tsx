"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { TicketForm } from "./ticket-form";

export function NewTicketToggle({ bookings, defaultOpen }: { bookings: { id: string; bookingNumber: string; propertyName: string }[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return open ? (
    <section className="card p-5" aria-labelledby="nt-h">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="nt-h" className="font-semibold">
          New support ticket
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <TicketForm bookings={bookings} />
    </section>
  ) : (
    <Button onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden /> Raise a ticket
    </Button>
  );
}

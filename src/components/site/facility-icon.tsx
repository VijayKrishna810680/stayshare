import {
  AirVent, ArrowUpDown, Bath, BatteryCharging, BookOpen, BriefcaseMedical, Cctv, CircleCheck, CookingPot, Dumbbell, FireExtinguisher, GlassWater, Lock,
  ParkingCircle, Refrigerator, ShieldCheck, Shirt, ShowerHead, Sparkles, Sun, Tv, UtensilsCrossed, WashingMachine, Wifi,
} from "lucide-react";

const MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  AirVent, ArrowUpDown, Bath, BatteryCharging, BookOpen, BriefcaseMedical, Cctv, CookingPot, Dumbbell, FireExtinguisher, GlassWater, Lock,
  ParkingCircle, Refrigerator, ShieldCheck, Shirt, ShowerHead, Sparkles, Sun, Tv, UtensilsCrossed, WashingMachine, Wifi,
};

export function FacilityIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const I = (name && MAP[name]) || CircleCheck;
  return <I className={className ?? "h-5 w-5"} aria-hidden />;
}

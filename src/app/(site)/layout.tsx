import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { getSupportContacts } from "@/lib/contact";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MobileBottomNav } from "@/components/site/mobile-nav";
import { SupportWidget } from "@/components/site/chat-widget";
import { ServiceWorkerRegister } from "@/components/site/sw-register";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, contacts, cityRows] = await Promise.all([
    getCurrentUser(),
    getSupportContacts(),
    db.select({ name: cities.name, slug: cities.slug, isPopular: cities.isPopular }).from(cities).where(and(eq(cities.active, true))).orderBy(asc(cities.name)),
  ]);
  const headerUser = user ? { name: user.name, isAdmin: user.isAdmin, isOwner: user.isOwner, isStaff: user.isStaff } : null;
  const popular = cityRows.filter((c) => c.isPopular);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={headerUser} cities={cityRows} />
      <main id="main" className="flex-1 pb-20 lg:pb-0">
        {children}
      </main>
      <SiteFooter cities={popular.length ? popular : cityRows} contacts={contacts} />
      <div className="h-16 lg:hidden" aria-hidden />
      <MobileBottomNav chatEnabled={contacts.liveChat} />
      <SupportWidget contacts={contacts} loggedIn={Boolean(user)} />
      <ServiceWorkerRegister />
    </div>
  );
}

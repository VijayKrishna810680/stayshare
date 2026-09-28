import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access denied" };

export default async function ForbiddenPage() {
  const u = await getCurrentUser();
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold">You don&apos;t have access to this page</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{u ? `You're signed in as ${u.name}. This area needs a different role or permission.` : "Please log in with an account that has access."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <LinkButton href="/">Go home</LinkButton>
          {u ? (
            <LinkButton href="/account" variant="outline">
              My account
            </LinkButton>
          ) : (
            <LinkButton href="/login" variant="outline">
              Log in
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}

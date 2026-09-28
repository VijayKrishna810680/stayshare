/** Where to send a user after authentication. An explicit safe `next` wins; otherwise by role. */
export function postLoginPath(res: { roles?: string[]; isAdmin?: boolean }, next?: string | null) {
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") && !next.startsWith("/register") ? next : null;
  if (safeNext) return safeNext;
  if (res.isAdmin) return "/admin";
  if (res.roles?.includes("OWNER")) return "/owner";
  if (res.roles?.includes("STAFF")) return "/staff";
  return "/account";
}

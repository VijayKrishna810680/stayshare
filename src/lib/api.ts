import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError, badRequest } from "./errors";
import { logger } from "./logger";
import { clientIp, rateLimit } from "./rate-limit";

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: { params: P; ip: string }) => Promise<Response | unknown>;

/**
 * Wrap a route handler with central error handling, structured logging and optional rate limiting.
 * Returning a plain object sends it as JSON `{ data }`.
 */
export function api<P = Record<string, string>>(
  handler: Handler<P>,
  opts: { rateLimit?: { limit: number; windowSec: number; key?: string } } = {},
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    const started = Date.now();
    const ip = clientIp(req);
    try {
      if (opts.rateLimit) {
        rateLimit(`${opts.rateLimit.key ?? req.nextUrl.pathname}:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      const params = (await ctx?.params) ?? ({} as P);
      const out = await handler(req, { params, ip });
      if (out instanceof Response) return out;
      return NextResponse.json({ data: out ?? null });
    } catch (e) {
      if (e instanceof AppError) {
        return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: e.issues[0]?.message ?? "Invalid input", details: e.flatten() } },
          { status: 422 },
        );
      }
      logger.error("api.unhandled", {
        path: req.nextUrl.pathname,
        method: req.method,
        err: e instanceof Error ? e.stack : String(e),
      });
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
    } finally {
      logger.debug("api", { method: req.method, path: req.nextUrl.pathname, ms: Date.now() - started });
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export function reqMeta(req: NextRequest) {
  return { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined };
}

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new AppError(400, "BAD_REQUEST", m, d);
export const unauthorized = (m = "Please log in to continue") => new AppError(401, "UNAUTHORIZED", m);
export const forbidden = (m = "You do not have permission to do this") => new AppError(403, "FORBIDDEN", m);
export const notFound = (m = "Not found") => new AppError(404, "NOT_FOUND", m);
export const conflict = (m: string, d?: unknown) => new AppError(409, "CONFLICT", m, d);
export const tooMany = (m = "Too many requests. Please try again shortly.") => new AppError(429, "RATE_LIMITED", m);

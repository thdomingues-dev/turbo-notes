import "client-only";

import createClient from "openapi-fetch";

import type { components, paths } from "./generated/schema";

const DEFAULT_API_BASE_URL = "/api/v1";
const API_PATH_PREFIX = "/api/v1";

export type ApiErrorPayload =
  | components["schemas"]["Error"]
  | components["schemas"]["RevisionConflictError"];
type ApiSession = components["schemas"]["Session"];

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload | null;

  constructor(
    status: number,
    message: string,
    payload: ApiErrorPayload | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function isNotAuthenticatedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.payload?.code === "not_authenticated"
  );
}

let csrfToken: string | null = null;
let csrfBootstrap: Promise<string> | null = null;

function configuredApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(
    /\/$/,
    "",
  );
}

function apiOriginBaseUrl(): string {
  const configured = configuredApiBaseUrl();
  const origin = configured.endsWith(API_PATH_PREFIX)
    ? configured.slice(0, -API_PATH_PREFIX.length)
    : configured;
  if (origin) return origin;
  return typeof window === "undefined" ? "" : window.location.origin;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const encodedName = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));

  return cookie ? decodeURIComponent(cookie.slice(encodedName.length)) : null;
}

function errorMessage(payload: ApiErrorPayload | null, status: number): string {
  const firstFieldError = payload?.errors
    ? Object.values(payload.errors).flatMap((value) => value)[0]
    : undefined;

  if (payload?.code === "validation_error" && firstFieldError) {
    return firstFieldError;
  }
  if (payload?.detail) return payload.detail;

  return firstFieldError ?? `Request failed with status ${status}.`;
}

async function bootstrapCsrf(): Promise<string> {
  const cookieToken = readCookie("csrftoken");
  if (cookieToken) return cookieToken;

  const session: ApiSession = unwrapApiResponse(
    await apiClient.GET("/api/v1/auth/session/"),
  );
  const token = session.csrf_token || readCookie("csrftoken");
  if (!token) {
    throw new ApiError(
      0,
      "The server did not provide a CSRF token. Check the session endpoint and cookie domain.",
    );
  }

  return token;
}

async function ensureCsrfToken(): Promise<string> {
  const cookieToken = readCookie("csrftoken");
  if (cookieToken) csrfToken = cookieToken;
  if (csrfToken) return csrfToken;

  csrfBootstrap ??= bootstrapCsrf();
  try {
    csrfToken = await csrfBootstrap;
    return csrfToken;
  } finally {
    csrfBootstrap = null;
  }
}

export const apiClient = createClient<paths>({
  baseUrl: apiOriginBaseUrl(),
  credentials: "include",
  cache: "no-store",
  headers: { Accept: "application/json" },
  fetch: (request) => globalThis.fetch(request),
});

export async function csrfHeader(): Promise<{ "X-CSRFToken": string }> {
  return { "X-CSRFToken": await ensureCsrfToken() };
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiErrorPayload;
  response: Response;
}

export function unwrapApiResponse<T>(result: ApiResponse<T>): T {
  if (!result.response.ok) {
    const payload = result.error ?? null;
    throw new ApiError(
      result.response.status,
      errorMessage(payload, result.response.status),
      payload,
    );
  }

  if (result.data !== undefined || result.response.status === 204) {
    return result.data as T;
  }
  throw new ApiError(
    result.response.status,
    "The server returned an invalid empty response.",
  );
}

export function resetApiClientForTests(): void {
  csrfToken = null;
  csrfBootstrap = null;
}

import type {
  AuthCredentials,
  Session,
  SessionUser,
  AuthSubmissionErrors,
} from "../model/types";
import {
  ApiError,
  apiClient,
  csrfHeader,
  unwrapApiResponse,
} from "@/shared/api/client";
import type { components } from "@/shared/api/generated/schema";

type ApiSession = components["schemas"]["Session"];

function adaptSession(response: ApiSession): Session {
  if (response.authenticated && response.user) {
    return { authenticated: true, user: response.user };
  }
  if (!response.authenticated && response.user === null) {
    return { authenticated: false, user: null };
  }
  throw new ApiError(0, "The server returned an invalid session response.");
}

export async function getSession(signal?: AbortSignal): Promise<Session> {
  const response = unwrapApiResponse(
    await apiClient.GET("/api/v1/auth/session/", signal ? { signal } : {}),
  );
  return adaptSession(response);
}

export async function signUp(
  credentials: AuthCredentials,
): Promise<SessionUser> {
  const response = unwrapApiResponse(
    await apiClient.POST("/api/v1/auth/signup/", {
      params: { header: await csrfHeader() },
      body: credentials,
    }),
  );
  return response;
}

export async function logIn(
  credentials: AuthCredentials,
): Promise<SessionUser> {
  const response = unwrapApiResponse(
    await apiClient.POST("/api/v1/auth/login/", {
      params: { header: await csrfHeader() },
      body: credentials,
    }),
  );
  return response;
}

export async function logOut(): Promise<void> {
  unwrapApiResponse(
    await apiClient.POST("/api/v1/auth/logout/", {
      params: { header: await csrfHeader() },
    }),
  );
}

export function adaptAuthSubmissionError(error: unknown): AuthSubmissionErrors {
  const apiFieldErrors =
    error instanceof ApiError ? error.payload?.errors : undefined;
  const email = apiFieldErrors?.email?.join(" ") ?? null;
  const password = apiFieldErrors?.password?.join(" ") ?? null;
  const nonFieldError = apiFieldErrors?.non_field_errors?.join(" ");

  return {
    email,
    password,
    form:
      nonFieldError ??
      (email || password
        ? null
        : error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."),
  };
}

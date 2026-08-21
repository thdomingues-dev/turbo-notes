import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type {
  AuthenticatedSession,
  Session,
  SessionUser,
} from "../model/types";
import { apiInternalBaseUrl } from "@/shared/config/api.server";

function isSessionUser(value: unknown): value is SessionUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "email" in value &&
    typeof value.email === "string"
  );
}

function isSessionPayload(payload: unknown): payload is Session {
  if (typeof payload !== "object" || payload === null) return false;
  if (!("authenticated" in payload) || !("user" in payload)) return false;

  return payload.authenticated === true
    ? isSessionUser(payload.user)
    : payload.authenticated === false && payload.user === null;
}

export async function getRequestSession(): Promise<Session> {
  const cookie = (await headers()).get("cookie");
  const response = await fetch(`${apiInternalBaseUrl()}/api/v1/auth/session/`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Unable to verify the current session (status ${response.status}).`,
    );
  }

  const payload: unknown = await response.json();
  if (!isSessionPayload(payload)) {
    throw new Error("The session endpoint returned an invalid response.");
  }

  return payload;
}

export async function isRequestAuthenticated(): Promise<boolean> {
  return (await getRequestSession()).authenticated;
}

export async function redirectAuthenticatedRequest(): Promise<void> {
  if ((await getRequestSession()).authenticated) redirect("/notes");
}

export async function redirectAnonymousRequest(): Promise<AuthenticatedSession> {
  const session = await getRequestSession();
  if (!session.authenticated) redirect("/login");
  return session;
}

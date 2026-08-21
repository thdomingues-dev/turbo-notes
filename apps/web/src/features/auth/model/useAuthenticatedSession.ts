"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSession } from "../api/auth";
import { authKeys } from "../api/queryKeys";
import { isNotAuthenticatedError } from "@/shared/api/client";
import type { AuthenticatedSession } from "./types";

interface AuthenticatedSessionOptions {
  onSignedOut: () => void;
  initialSession?: AuthenticatedSession;
}

export function useAuthenticatedSession({
  onSignedOut,
  initialSession,
}: AuthenticatedSessionOptions) {
  const query = useQuery({
    queryKey: authKeys.session,
    queryFn: ({ signal }) => getSession(signal),
    refetchOnWindowFocus: "always",
    ...(initialSession ? { initialData: initialSession } : {}),
  });
  const user =
    query.data?.authenticated && query.data.user ? query.data.user : null;
  const backgroundError =
    query.isRefetchError &&
    user &&
    query.error &&
    !isNotAuthenticatedError(query.error)
      ? query.error
      : null;

  useEffect(() => {
    if (isNotAuthenticatedError(query.error) || (query.data && !user)) {
      onSignedOut();
    }
  }, [onSignedOut, query.data, query.error, user]);

  return {
    user,
    ownerId: user?.id ?? null,
    isPending: query.isPending,
    blockingError: user ? null : query.error,
    backgroundError,
    retry: () => void query.refetch(),
  } as const;
}

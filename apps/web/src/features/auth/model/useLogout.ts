"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import { logOut } from "../api/auth";
import { isNotAuthenticatedError } from "@/shared/api/client";

interface LogoutOptions {
  onSignedOut: () => void;
}

export function useLogout({ onSignedOut }: LogoutOptions) {
  const mutation = useMutation({ mutationFn: logOut });
  const { isPending, error, mutateAsync, reset } = mutation;

  const logout = useCallback(async () => {
    if (isPending) return;
    reset();

    try {
      await mutateAsync();
      onSignedOut();
    } catch (logoutError) {
      if (isNotAuthenticatedError(logoutError)) onSignedOut();
    }
  }, [isPending, mutateAsync, onSignedOut, reset]);

  return {
    logout,
    isLoggingOut: isPending,
    error: error
      ? error instanceof Error
        ? error.message
        : "Unable to log out."
      : null,
  } as const;
}

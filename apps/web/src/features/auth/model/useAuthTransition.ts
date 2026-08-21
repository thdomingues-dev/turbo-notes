"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { publishAuthSessionChange } from "./sessionSynchronization";

export function useAuthTransition(
  destination: "/login" | "/notes",
  beforeTransition?: () => void,
) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useCallback(() => {
    beforeTransition?.();
    queryClient.clear();
    publishAuthSessionChange();
    router.replace(destination);
  }, [beforeTransition, destination, queryClient, router]);
}

"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { subscribeToAuthSessionChanges } from "@/features/auth";
import {
  clearRecoverableNoteDrafts,
  maintainRecoverableNoteDrafts,
} from "@/features/note-autosave";
import { createQueryClient } from "./queryClient";

export const AppProviders = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    maintainRecoverableNoteDrafts();
    return subscribeToAuthSessionChanges(() => {
      clearRecoverableNoteDrafts();
      void queryClient.cancelQueries();
      window.location.reload();
    });
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

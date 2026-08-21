"use client";

const AUTH_SESSION_EVENT_KEY = "turbo-notes:auth-session-change";
const AUTH_SESSION_CHANNEL = "turbo-notes:auth-session";
let sourceId: string | null = null;

function currentSourceId(): string {
  sourceId ??= globalThis.crypto.randomUUID();
  return sourceId;
}

export function publishAuthSessionChange(): void {
  if (typeof window === "undefined") return;

  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
    channel.postMessage(currentSourceId());
    channel.close();
    return;
  }

  try {
    window.localStorage.setItem(
      AUTH_SESSION_EVENT_KEY,
      `${Date.now()}:${globalThis.crypto.randomUUID()}`,
    );
    window.localStorage.removeItem(AUTH_SESSION_EVENT_KEY);
  } catch {
    // Focus revalidation remains the fallback when cross-tab messaging is blocked.
  }
}

export function subscribeToAuthSessionChanges(
  onChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (event.data !== currentSourceId()) onChange();
    });
    return () => channel.close();
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SESSION_EVENT_KEY && event.newValue !== null) {
      onChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

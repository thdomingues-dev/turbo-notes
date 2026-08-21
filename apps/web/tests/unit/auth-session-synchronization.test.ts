import { afterEach, describe, expect, it, vi } from "vitest";

import {
  publishAuthSessionChange,
  subscribeToAuthSessionChanges,
} from "@/features/auth/model/sessionSynchronization";

describe("authentication session synchronization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ignores its own broadcast while accepting another tab", () => {
    class MockBroadcastChannel {
      static channels: MockBroadcastChannel[] = [];

      private closed = false;
      private readonly listeners = new Set<
        (event: MessageEvent<unknown>) => void
      >();

      constructor(private readonly name: string) {
        MockBroadcastChannel.channels.push(this);
      }

      addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === "message") this.listeners.add(listener);
      }

      postMessage(data: unknown) {
        for (const channel of MockBroadcastChannel.channels) {
          if (channel === this || channel.closed || channel.name !== this.name)
            continue;
          for (const listener of channel.listeners) {
            listener(new MessageEvent("message", { data }));
          }
        }
      }

      close() {
        this.closed = true;
        this.listeners.clear();
      }
    }

    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const onChange = vi.fn();
    const unsubscribe = subscribeToAuthSessionChanges(onChange);

    publishAuthSessionChange();
    expect(onChange).not.toHaveBeenCalled();

    const anotherTab = new MockBroadcastChannel("turbo-notes:auth-session");
    anotherTab.postMessage("another-tab");
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    anotherTab.postMessage("another-change");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

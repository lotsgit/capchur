import { describe, expect, it } from "vitest";

import type { SyncRequestMessage } from "../../utils/contracts";
import { connectAndSync } from "./sync-client";

const session = {
  id: "0198f1d0-c184-7000-8000-000000000701",
  status: "stopped" as const,
  startedAt: 100,
  updatedAt: 200,
  steps: [],
};

describe("review sync client", () => {
  it("queues the stopped session before interactive authorization", async () => {
    const requests: SyncRequestMessage[] = [];
    const status = await connectAndSync(session, async (message) => {
      requests.push(message);
      return {
        version: 1,
        requestId: message.requestId,
        type: "sync.response",
        ok: true,
        status: {
          state: message.type === "sync.authorize" ? "synced" : "disconnected",
          connectedUserName: message.type === "sync.authorize" ? "Ada Lovelace" : null,
          sessionId: session.id,
          guideId: message.type === "sync.authorize" ? "0198f1d0-c184-7000-8000-000000000702" : null,
          attempts: 0,
          nextAttemptAt: null,
          message: message.type === "sync.authorize"
            ? "Connected as Ada Lovelace. Session synced."
            : "Sign in to continue syncing.",
        },
      };
    });

    expect(requests.map(({ type }) => type)).toEqual(["sync.enqueue", "sync.authorize"]);
    expect(requests[0]).toMatchObject({ type: "sync.enqueue", session });
    expect(status).toMatchObject({
      state: "synced",
      connectedUserName: "Ada Lovelace",
    });
  });
});

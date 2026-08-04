import { randomUUID } from "node:crypto";

import type { AiUsageRecorder } from "./ai-description";
import type { DatabaseHandle } from "./db";
import { aiDescriptionUsage } from "./db/schema";

export function createAiUsageRecorder(
  handle: DatabaseHandle,
  createId: () => string = randomUUID,
): AiUsageRecorder {
  return {
    async record(usage) {
      await handle.database.insert(aiDescriptionUsage).values({
        id: createId(),
        ...usage,
      });
    },
  };
}
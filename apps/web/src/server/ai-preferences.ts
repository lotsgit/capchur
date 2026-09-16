import { AiPreferencesSchema, AiPreferencesWriteSchema, type AiPreferences } from "@capchur/contracts";
import { eq } from "drizzle-orm";

import type { WorkspaceAuthenticator } from "./auth";
import type { DatabaseHandle } from "./db";
import { user } from "./db/schema";

export interface AiPreferencesRepository {
  get(userId: string): Promise<AiPreferences | null>;
  set(userId: string, write: Pick<AiPreferences, "processingMode" | "triggerMode">, now: number): Promise<AiPreferences>;
}

export function createAiPreferencesRepository(handle: DatabaseHandle): AiPreferencesRepository {
  const database = handle.database;
  return {
    async get(userId) {
      const [row] = await database
        .select({
          aiProcessingMode: user.aiProcessingMode,
          aiTriggerMode: user.aiTriggerMode,
          aiPreferencesSetAt: user.aiPreferencesSetAt,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (!row?.aiProcessingMode || !row.aiTriggerMode || row.aiPreferencesSetAt == null) {
        return null;
      }

      return AiPreferencesSchema.parse({
        processingMode: row.aiProcessingMode,
        triggerMode: row.aiTriggerMode,
        configuredAt: row.aiPreferencesSetAt,
      });
    },

    async set(userId, write, now) {
      const preferences = AiPreferencesSchema.parse({ ...write, configuredAt: now });
      await database
        .update(user)
        .set({
          aiProcessingMode: preferences.processingMode,
          aiTriggerMode: preferences.triggerMode,
          aiPreferencesSetAt: preferences.configuredAt,
        })
        .where(eq(user.id, userId));
      return preferences;
    },
  };
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export class AiPreferencesApi {
  constructor(
    private readonly authenticator: WorkspaceAuthenticator,
    private readonly repository: AiPreferencesRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async handle(request: Request): Promise<Response> {
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");

    if (request.method === "GET") {
      return Response.json({ preferences: await this.repository.get(principal.userId) });
    }

    if (request.method === "PUT") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        body = undefined;
      }
      const parsed = AiPreferencesWriteSchema.safeParse(body);
      if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "AI preferences are invalid");
      const preferences = await this.repository.set(principal.userId, parsed.data, this.now());
      return Response.json({ preferences });
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
}

import {
  AiStepNotesEnhancementRequestSchema,
  AiStepNotesProviderOutputSchema,
  type AiStepNotesEnhancementRequest,
  type AiStepNotesEnhancementResponse,
} from "@capchur/contracts";
import { AI_STEP_NOTES_SYSTEM_PROMPT, sanitizeStepNotesInput } from "@capchur/ai-notes-core";

import type { AiUsageRecorder, AiRateLimiter } from "./ai-description";
import { WindowRateLimiter } from "./ai-description";
import {
  CompositeRateLimiter,
  createEnvironmentAiJsonProvider,
  nonnegativeEnvironmentNumber,
  normalizeAiUsage,
  type AiJsonProvider,
  type AiJsonSchemaSpec,
} from "./ai-provider";
import type { WorkspaceAuthenticator, WorkspacePrincipal } from "./auth";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_REQUESTS_PER_MINUTE = 10;
const DEFAULT_REQUESTS_PER_DAY = 200;
const DAY_MS = 24 * 60 * 60 * 1_000;

const STEP_NOTES_JSON_SCHEMA: AiJsonSchemaSpec = {
  name: "step_notes",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      notes: { type: ["string", "null"], minLength: 1, maxLength: 500 },
    },
    required: ["notes"],
  },
};

function deterministicFallback(
  input: AiStepNotesEnhancementRequest,
  fallbackReason: NonNullable<AiStepNotesEnhancementResponse["fallbackReason"]>,
): AiStepNotesEnhancementResponse {
  return { notes: input.existingNotes, source: "deterministic", fallbackReason };
}

export class AiStepNotesService {
  constructor(
    private readonly provider: AiJsonProvider | null,
    private readonly usage: AiUsageRecorder,
    private readonly limiter: AiRateLimiter = new WindowRateLimiter(),
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly inputCostMicrosPerMillion = 0,
    private readonly outputCostMicrosPerMillion = 0,
  ) {}

  async enhance(
    principal: WorkspacePrincipal,
    input: AiStepNotesEnhancementRequest,
  ): Promise<AiStepNotesEnhancementResponse> {
    if (!this.provider) return deterministicFallback(input, "not-configured");
    if (!this.limiter.allow(`${principal.workspaceId}:${principal.userId}`, this.now())) {
      return deterministicFallback(input, "rate-limited");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const result = await this.provider.call(
        AI_STEP_NOTES_SYSTEM_PROMPT,
        sanitizeStepNotesInput(input),
        STEP_NOTES_JSON_SCHEMA,
        controller.signal,
      );
      const normalizedUsage = normalizeAiUsage(result.usage);
      await this.usage.record({
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        model: result.model,
        ...normalizedUsage,
        estimatedCostMicros: Math.ceil(
          (normalizedUsage.inputTokens * this.inputCostMicrosPerMillion
            + normalizedUsage.outputTokens * this.outputCostMicrosPerMillion) / 1_000_000,
        ),
        createdAt: this.now(),
        feature: "notes",
      });
      const output = AiStepNotesProviderOutputSchema.safeParse(result.output);
      if (!output.success) return deterministicFallback(input, "invalid-output");
      return { notes: output.data.notes, source: "ai", fallbackReason: null };
    } catch {
      return deterministicFallback(input, "provider-failure");
    } finally {
      clearTimeout(timer);
    }
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export class AiStepNotesApi {
  constructor(
    private readonly authenticator: WorkspaceAuthenticator,
    private readonly service: AiStepNotesService,
  ) {}

  async enhance(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");
    // Deliberate deviation from the owner-only S15 description gate: notes are active by default
    // for any authenticated workspace member, not an owner-gated workspace consent.

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const parsed = AiStepNotesEnhancementRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "AI notes data is invalid");
    return Response.json(await this.service.enhance(principal, parsed.data));
  }
}

export function createEnvironmentAiStepNotesService(usage: AiUsageRecorder): AiStepNotesService {
  return new AiStepNotesService(
    createEnvironmentAiJsonProvider(),
    usage,
    new CompositeRateLimiter([
      new WindowRateLimiter(nonnegativeEnvironmentNumber("CAPCHUR_AI_REQUESTS_PER_MINUTE") || DEFAULT_REQUESTS_PER_MINUTE),
      new WindowRateLimiter(nonnegativeEnvironmentNumber("CAPCHUR_AI_REQUESTS_PER_DAY") || DEFAULT_REQUESTS_PER_DAY, DAY_MS),
    ]),
    Date.now,
    nonnegativeEnvironmentNumber("CAPCHUR_AI_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS,
    nonnegativeEnvironmentNumber("CAPCHUR_AI_INPUT_COST_MICROS_PER_MILLION"),
    nonnegativeEnvironmentNumber("CAPCHUR_AI_OUTPUT_COST_MICROS_PER_MILLION"),
  );
}

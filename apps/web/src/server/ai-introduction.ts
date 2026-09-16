import {
  AiIntroductionEnhancementRequestSchema,
  AiIntroductionProviderOutputSchema,
  type AiIntroductionEnhancementRequest,
  type AiIntroductionEnhancementResponse,
} from "@capchur/contracts";
import { AI_INTRODUCTION_SYSTEM_PROMPT, sanitizeIntroductionInput } from "@capchur/ai-notes-core";

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

const INTRODUCTION_JSON_SCHEMA: AiJsonSchemaSpec = {
  name: "guide_introduction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      introduction: { type: "string", minLength: 1, maxLength: 2_000 },
    },
    required: ["introduction"],
  },
};

function deterministicFallback(
  input: AiIntroductionEnhancementRequest,
  fallbackReason: NonNullable<AiIntroductionEnhancementResponse["fallbackReason"]>,
): AiIntroductionEnhancementResponse {
  return { introduction: input.existingIntroduction, source: "deterministic", fallbackReason };
}

export class AiIntroductionService {
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
    input: AiIntroductionEnhancementRequest,
  ): Promise<AiIntroductionEnhancementResponse> {
    if (!this.provider) return deterministicFallback(input, "not-configured");
    if (!this.limiter.allow(`${principal.workspaceId}:${principal.userId}`, this.now())) {
      return deterministicFallback(input, "rate-limited");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const result = await this.provider.call(
        AI_INTRODUCTION_SYSTEM_PROMPT,
        sanitizeIntroductionInput(input),
        INTRODUCTION_JSON_SCHEMA,
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
        feature: "introduction",
      });
      const output = AiIntroductionProviderOutputSchema.safeParse(result.output);
      if (!output.success) return deterministicFallback(input, "invalid-output");
      return { introduction: output.data.introduction, source: "ai", fallbackReason: null };
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

export class AiIntroductionApi {
  constructor(
    private readonly authenticator: WorkspaceAuthenticator,
    private readonly service: AiIntroductionService,
  ) {}

  async enhance(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const principal = await this.authenticator.authenticate(request);
    if (!principal) return jsonError(401, "UNAUTHENTICATED", "Authentication is required");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const parsed = AiIntroductionEnhancementRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "AI introduction data is invalid");
    return Response.json(await this.service.enhance(principal, parsed.data));
  }
}

export function createEnvironmentAiIntroductionService(usage: AiUsageRecorder): AiIntroductionService {
  return new AiIntroductionService(
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

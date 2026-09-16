/**
 * Shared OpenAI-compatible chat-completions plumbing for the notes and introduction AI tasks.
 * ai-description.ts (S15) keeps its own tested single-model provider; this module adds the
 * multi-model free-tier fallback chain used by the newer AI notes/introduction services.
 */
import type { AiRateLimiter } from "./ai-description";

export interface AiProviderUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface AiJsonCallResult {
    output: unknown;
    usage: AiProviderUsage;
    model: string;
}

export interface AiJsonSchemaSpec {
    name: string;
    schema: Record<string, unknown>;
}

/** Requires every limiter to allow the request (e.g. a per-minute cap AND a per-day cap). */
export class CompositeRateLimiter implements AiRateLimiter {
    constructor(private readonly limiters: readonly AiRateLimiter[]) {}

    allow(key: string, now: number): boolean {
        return this.limiters.every((limiter) => limiter.allow(key, now));
    }
}

/** Thrown when a model in the fallback chain reports it is rate-limited (HTTP 429). */
export class AiModelRateLimitedError extends Error {
    constructor(public readonly model: string) {
        super(`AI model "${model}" is rate-limited`);
    }
}

export function parseModelList(value: string): string[] {
    return value.split(",").map((model) => model.trim()).filter(Boolean);
}

export function nonnegativeEnvironmentNumber(name: string): number {
    const value = Number(process.env[name] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function normalizeAiUsage(usage: AiProviderUsage): AiProviderUsage {
    return {
        inputTokens: Math.max(0, Math.floor(usage.inputTokens)),
        outputTokens: Math.max(0, Math.floor(usage.outputTokens)),
    };
}

export interface AiJsonProvider {
    call(
        systemPrompt: string,
        context: unknown,
        jsonSchema: AiJsonSchemaSpec,
        signal: AbortSignal,
    ): Promise<AiJsonCallResult>;
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint with a fixed system prompt and a strict
 * JSON schema, trying each configured free model in order until one answers (falling through the
 * chain only on a 429 rate-limit response; any other failure stops the chain immediately).
 */
export class OpenAiCompatibleJsonProvider implements AiJsonProvider {
    constructor(
        private readonly endpoint: string,
        private readonly apiKey: string,
        public readonly models: readonly string[],
        private readonly appUrl: string | null = null,
        private readonly appName: string | null = null,
        private readonly fetcher: typeof fetch = fetch,
    ) {}

    async call(
        systemPrompt: string,
        context: unknown,
        jsonSchema: AiJsonSchemaSpec,
        signal: AbortSignal,
    ): Promise<AiJsonCallResult> {
        let lastError: unknown;

        for (const model of this.models) {
            try {
                return await this.callModel(model, systemPrompt, context, jsonSchema, signal);
            } catch (error) {
                lastError = error;
                if (!(error instanceof AiModelRateLimitedError)) throw error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error("AI provider request failed");
    }

    private async callModel(
        model: string,
        systemPrompt: string,
        context: unknown,
        jsonSchema: AiJsonSchemaSpec,
        signal: AbortSignal,
    ): Promise<AiJsonCallResult> {
        const response = await this.fetcher(this.endpoint, {
            method: "POST",
            headers: {
                authorization: `Bearer ${this.apiKey}`,
                "content-type": "application/json",
                ...(this.appUrl ? { "HTTP-Referer": this.appUrl } : {}),
                ...(this.appName ? { "X-Title": this.appName } : {}),
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify({ context }) },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
                },
                temperature: 0.2,
                max_tokens: 200,
            }),
            signal,
        });

        if (response.status === 429) throw new AiModelRateLimitedError(model);
        if (!response.ok) throw new Error("AI provider request failed");

        const body: unknown = await response.json();
        if (!body || typeof body !== "object") throw new Error("AI provider response is invalid");
        const record = body as Record<string, unknown>;
        const choices = record.choices;
        const usage = record.usage;
        if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
            throw new Error("AI provider response has no choice");
        }
        const message = (choices[0] as Record<string, unknown>).message;
        const content = message && typeof message === "object"
            ? (message as Record<string, unknown>).content
            : undefined;
        if (typeof content !== "string") throw new Error("AI provider response has no content");
        const usageRecord = usage && typeof usage === "object" ? usage as Record<string, unknown> : {};

        return {
            output: JSON.parse(content) as unknown,
            usage: {
                inputTokens: typeof usageRecord.prompt_tokens === "number" ? usageRecord.prompt_tokens : 0,
                outputTokens: typeof usageRecord.completion_tokens === "number" ? usageRecord.completion_tokens : 0,
            },
            model,
        };
    }
}

export interface EnvironmentAiProviderConfig {
    apiKey: string;
    models: string[];
    endpoint: string;
    appUrl: string | null;
    appName: string | null;
}

/**
 * Reads the shared free-provider configuration (defaults target OpenRouter's OpenAI-compatible
 * endpoint). `CAPCHUR_AI_MODEL` is an ordered, comma-separated list of currently-free model ids;
 * operators should check each model/provider's published data-retention policy on OpenRouter and
 * prefer no-logging providers for the first entry — the free-model lineup changes over time.
 */
export function createEnvironmentAiProviderConfig(): EnvironmentAiProviderConfig | null {
    const apiKey = process.env.CAPCHUR_AI_API_KEY?.trim();
    const modelList = process.env.CAPCHUR_AI_MODEL?.trim();
    if (!apiKey || !modelList) return null;

    const models = parseModelList(modelList);
    if (models.length === 0) return null;

    const endpoint = process.env.CAPCHUR_AI_ENDPOINT?.trim()
        || "https://openrouter.ai/api/v1/chat/completions";
    const url = new URL(endpoint);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
        throw new Error("CAPCHUR_AI_ENDPOINT must use HTTPS in production");
    }

    return {
        apiKey,
        models,
        endpoint: url.toString(),
        appUrl: process.env.CAPCHUR_AI_APP_URL?.trim() || null,
        appName: process.env.CAPCHUR_AI_APP_NAME?.trim() || "Capchur",
    };
}

export function createEnvironmentAiJsonProvider(): OpenAiCompatibleJsonProvider | null {
    const config = createEnvironmentAiProviderConfig();
    if (!config) return null;
    return new OpenAiCompatibleJsonProvider(
        config.endpoint,
        config.apiKey,
        config.models,
        config.appUrl,
        config.appName,
    );
}

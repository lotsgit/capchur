import { describe, expect, it, vi } from "vitest";

import type { AiRateLimiter } from "./ai-description";
import {
  CompositeRateLimiter,
  OpenAiCompatibleJsonProvider,
  parseModelList,
} from "./ai-provider";

const JSON_SCHEMA = {
  name: "test_output",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { value: { type: "string" } },
    required: ["value"],
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("parseModelList", () => {
  it("splits, trims, and drops empty entries", () => {
    expect(parseModelList(" model-a:free , model-b:free ,,")).toEqual(["model-a:free", "model-b:free"]);
  });
});

describe("OpenAiCompatibleJsonProvider", () => {
  it("retries the next free model on a 429 and returns the model that answered", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }));
    const provider = new OpenAiCompatibleJsonProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "server-secret",
      ["model-a:free", "model-b:free"],
      null,
      null,
      fetcher,
    );

    const result = await provider.call("system", { context: true }, JSON_SCHEMA, new AbortController().signal);

    expect(result).toEqual({ output: { value: "ok" }, usage: { inputTokens: 3, outputTokens: 2 }, model: "model-b:free" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body)).model).toBe("model-a:free");
    expect(JSON.parse(String((fetcher.mock.calls[1][1] as RequestInit).body)).model).toBe("model-b:free");
  });

  it("stops the chain immediately on a non-429 failure", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(500, { error: "boom" }));
    const provider = new OpenAiCompatibleJsonProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "server-secret",
      ["model-a:free", "model-b:free"],
      null,
      null,
      fetcher,
    );

    await expect(
      provider.call("system", { context: true }, JSON_SCHEMA, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends OpenRouter attribution headers when configured", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, {
      choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const provider = new OpenAiCompatibleJsonProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "server-secret",
      ["model-a:free"],
      "https://capchur.io",
      "Capchur",
      fetcher,
    );

    await provider.call("system", {}, JSON_SCHEMA, new AbortController().signal);

    const headers = (fetcher.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["HTTP-Referer"]).toBe("https://capchur.io");
    expect(headers["X-Title"]).toBe("Capchur");
  });
});

describe("CompositeRateLimiter", () => {
  it("only allows a request when every limiter allows it", () => {
    const allow = (value: boolean): AiRateLimiter => ({ allow: () => value });
    expect(new CompositeRateLimiter([allow(true), allow(true)]).allow("key", 0)).toBe(true);
    expect(new CompositeRateLimiter([allow(true), allow(false)]).allow("key", 0)).toBe(false);
  });
});

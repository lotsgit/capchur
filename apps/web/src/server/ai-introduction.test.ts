import { describe, expect, it, vi } from "vitest";

import type { AiIntroductionEnhancementRequest } from "@capchur/contracts";

import type { AiUsageRecorder } from "./ai-description";
import { WindowRateLimiter } from "./ai-description";
import {
  AiIntroductionApi,
  AiIntroductionService,
} from "./ai-introduction";
import type { AiJsonProvider } from "./ai-provider";
import type { WorkspaceAuthenticator } from "./auth";

const principal = { userId: "user-1", workspaceId: "workspace-1", role: "owner" } as const;
const request: AiIntroductionEnhancementRequest = {
  consent: true,
  guideTitle: "Reset a password",
  existingIntroduction: "",
  steps: [{ title: "Open settings", section: null, description: "Navigate to settings" }],
};

function createUsageRecorder(): AiUsageRecorder & { record: ReturnType<typeof vi.fn> } {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("AI introduction enhancement", () => {
  it("returns validated AI text, records usage with the introduction feature, and never stores context", async () => {
    const provider: AiJsonProvider = {
      call: vi.fn().mockResolvedValue({
        output: { introduction: "Follow these steps to reset your password." },
        usage: { inputTokens: 120, outputTokens: 20 },
        model: "model-a:free",
      }),
    };
    const usage = createUsageRecorder();
    const service = new AiIntroductionService(provider, usage, undefined, () => 500, 100, 2_000_000, 4_000_000);

    await expect(service.enhance(principal, request)).resolves.toEqual({
      introduction: "Follow these steps to reset your password.",
      source: "ai",
      fallbackReason: null,
    });
    expect(usage.record).toHaveBeenCalledWith({
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      model: "model-a:free",
      inputTokens: 120,
      outputTokens: 20,
      estimatedCostMicros: 320,
      createdAt: 500,
      feature: "introduction",
    });
    expect(JSON.stringify(usage.record.mock.calls)).not.toContain("Open settings");
  });

  it.each([
    ["provider failure", { call: vi.fn().mockRejectedValue(new Error("offline")) }, "provider-failure"],
    ["invalid output", { call: vi.fn().mockResolvedValue({ output: { introduction: "" }, usage: { inputTokens: 1, outputTokens: 1 }, model: "model-a:free" }) }, "invalid-output"],
  ])("keeps the existing introduction during %s", async (_name, behavior, fallbackReason) => {
    const provider = behavior as AiJsonProvider;
    const service = new AiIntroductionService(provider, createUsageRecorder());

    await expect(service.enhance(principal, request)).resolves.toEqual({
      introduction: request.existingIntroduction,
      source: "deterministic",
      fallbackReason,
    });
  });

  it("rate limits by workspace and user before calling the provider", async () => {
    const provider: AiJsonProvider = {
      call: vi.fn().mockResolvedValue({
        output: { introduction: "Follow these steps." },
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "model-a:free",
      }),
    };
    const service = new AiIntroductionService(provider, createUsageRecorder(), new WindowRateLimiter(1), () => 100);

    await service.enhance(principal, request);
    await expect(service.enhance(principal, request)).resolves.toEqual({
      introduction: request.existingIntroduction,
      source: "deterministic",
      fallbackReason: "rate-limited",
    });
    expect(provider.call).toHaveBeenCalledTimes(1);
  });

  it("falls back when no provider is configured", async () => {
    const service = new AiIntroductionService(null, createUsageRecorder());
    await expect(service.enhance(principal, request)).resolves.toEqual({
      introduction: request.existingIntroduction,
      source: "deterministic",
      fallbackReason: "not-configured",
    });
  });

  it("requires authentication and explicit consent at the API", async () => {
    const service = new AiIntroductionService(null, createUsageRecorder());
    const authenticate = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(principal);
    const api = new AiIntroductionApi({ authenticate } as unknown as WorkspaceAuthenticator, service);

    const createRequest = (body: unknown) => new Request("https://capchur.test/api/ai/introduction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect((await api.enhance(createRequest(request))).status).toBe(401);
    expect((await api.enhance(createRequest({ ...request, consent: false }))).status).toBe(400);
  });
});

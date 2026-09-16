import { describe, expect, it, vi } from "vitest";

import type { AiUsageRecorder } from "./ai-description";
import { WindowRateLimiter } from "./ai-description";
import { AiStepNotesApi, AiStepNotesService } from "./ai-step-notes";
import type { AiJsonProvider } from "./ai-provider";
import type { WorkspaceAuthenticator } from "./auth";

const principal = { userId: "user-1", workspaceId: "workspace-1", role: "member" } as const;
const request = {
  consent: true,
  stepTitle: "Continue",
  description: "Click Continue",
  section: null,
  existingNotes: null,
} as const;

function createUsageRecorder(): AiUsageRecorder & { record: ReturnType<typeof vi.fn> } {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("AI step notes enhancement", () => {
  it("returns validated AI notes and records usage with the notes feature", async () => {
    const provider: AiJsonProvider = {
      call: vi.fn().mockResolvedValue({
        output: { notes: "Requires an active session to continue." },
        usage: { inputTokens: 40, outputTokens: 10 },
        model: "model-a:free",
      }),
    };
    const usage = createUsageRecorder();
    const service = new AiStepNotesService(provider, usage, undefined, () => 500, 100, 2_000_000, 4_000_000);

    await expect(service.enhance(principal, request)).resolves.toEqual({
      notes: "Requires an active session to continue.",
      source: "ai",
      fallbackReason: null,
    });
    expect(usage.record).toHaveBeenCalledWith({
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      model: "model-a:free",
      inputTokens: 40,
      outputTokens: 10,
      estimatedCostMicros: 120,
      createdAt: 500,
      feature: "notes",
    });
  });

  it("allows a null notes result when no supporting detail is required", async () => {
    const provider: AiJsonProvider = {
      call: vi.fn().mockResolvedValue({
        output: { notes: null },
        usage: { inputTokens: 10, outputTokens: 2 },
        model: "model-a:free",
      }),
    };
    const service = new AiStepNotesService(provider, createUsageRecorder());

    await expect(service.enhance(principal, request)).resolves.toEqual({
      notes: null,
      source: "ai",
      fallbackReason: null,
    });
  });

  it.each([
    ["provider failure", { call: vi.fn().mockRejectedValue(new Error("offline")) }, "provider-failure"],
    ["invalid output", { call: vi.fn().mockResolvedValue({ output: { notes: "" }, usage: { inputTokens: 1, outputTokens: 1 }, model: "model-a:free" }) }, "invalid-output"],
  ])("keeps the existing notes during %s", async (_name, behavior, fallbackReason) => {
    const provider = behavior as AiJsonProvider;
    const service = new AiStepNotesService(provider, createUsageRecorder());

    await expect(service.enhance(principal, { ...request, existingNotes: "Prior note." })).resolves.toEqual({
      notes: "Prior note.",
      source: "deterministic",
      fallbackReason,
    });
  });

  it("rate limits by workspace and user before calling the provider", async () => {
    const provider: AiJsonProvider = {
      call: vi.fn().mockResolvedValue({
        output: { notes: "Note" },
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "model-a:free",
      }),
    };
    const service = new AiStepNotesService(provider, createUsageRecorder(), new WindowRateLimiter(1), () => 100);

    await service.enhance(principal, request);
    await expect(service.enhance(principal, request)).resolves.toEqual({
      notes: null,
      source: "deterministic",
      fallbackReason: "rate-limited",
    });
    expect(provider.call).toHaveBeenCalledTimes(1);
  });

  it("falls back when no provider is configured", async () => {
    const service = new AiStepNotesService(null, createUsageRecorder());
    await expect(service.enhance(principal, request)).resolves.toEqual({
      notes: null,
      source: "deterministic",
      fallbackReason: "not-configured",
    });
  });

  it("allows any authenticated member (not owner-only) and requires explicit consent", async () => {
    const service = new AiStepNotesService(null, createUsageRecorder());
    const authenticate = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(principal)
      .mockResolvedValueOnce(principal);
    const api = new AiStepNotesApi({ authenticate } as unknown as WorkspaceAuthenticator, service);

    const createRequest = (body: unknown) => new Request("https://capchur.test/api/ai/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect((await api.enhance(createRequest(request))).status).toBe(401);
    expect((await api.enhance(createRequest({ ...request, consent: false }))).status).toBe(400);
    expect((await api.enhance(createRequest(request))).status).toBe(200);
  });
});

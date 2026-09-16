import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalAiEngine } from "./local-engine";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLocalAiEngine", () => {
  it("uses the browser Prompt API when available and parses its JSON reply", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn().mockResolvedValue('Sure, here you go: {"notes": "Requires an admin role."}');
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt, destroy }),
    });

    const engine = await createLocalAiEngine();
    expect(engine).not.toBeNull();

    const result = await engine!.generateStepNotes({
      consent: true,
      stepTitle: "Continue",
      description: "Click Continue",
      section: null,
      existingNotes: null,
    });

    expect(result).toEqual({ notes: "Requires an admin role.", source: "ai", fallbackReason: null });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing notes when the model output does not parse", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: vi.fn().mockResolvedValue("not json"), destroy: vi.fn() }),
    });

    const engine = await createLocalAiEngine();
    const result = await engine!.generateStepNotes({
      consent: true,
      stepTitle: "Continue",
      description: "Click Continue",
      section: null,
      existingNotes: "Prior note.",
    });

    expect(result).toEqual({ notes: "Prior note.", source: "deterministic", fallbackReason: "invalid-output" });
  });

  it("returns null when neither the Prompt API nor WebGPU is available", async () => {
    vi.stubGlobal("LanguageModel", undefined);
    expect(await createLocalAiEngine()).toBeNull();
  });
});

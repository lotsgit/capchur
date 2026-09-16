import { AI_INTRODUCTION_SYSTEM_PROMPT, AI_STEP_NOTES_SYSTEM_PROMPT, sanitizeIntroductionInput, sanitizeStepNotesInput } from "@capchur/ai-notes-core";

import {
  AiIntroductionProviderOutputSchema,
  AiStepNotesProviderOutputSchema,
  type AiIntroductionEnhancementRequest,
  type AiIntroductionEnhancementResponse,
  type AiStepNotesEnhancementRequest,
  type AiStepNotesEnhancementResponse,
} from "@/lib/contracts";

export interface LocalAiDownloadProgress {
  progress: number;
  text: string;
}

export interface LocalAiEngine {
  generateStepNotes(input: AiStepNotesEnhancementRequest): Promise<AiStepNotesEnhancementResponse>;
  generateIntroduction(input: AiIntroductionEnhancementRequest): Promise<AiIntroductionEnhancementResponse>;
}

// Chrome's on-device Prompt API is not yet part of lib.dom.d.ts; this is the minimal shape used here.
interface BrowserLanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}

interface BrowserLanguageModelApi {
  availability(): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(): Promise<BrowserLanguageModelSession>;
}

function getBrowserLanguageModel(): BrowserLanguageModelApi | null {
  const candidate = (globalThis as Record<string, unknown>).LanguageModel;
  return candidate && typeof candidate === "object" ? candidate as BrowserLanguageModelApi : null;
}

function parseJsonObject(text: string): unknown {
  const match = /\{[\s\S]*\}/.exec(text);
  try {
    return JSON.parse(match ? match[0] : text);
  } catch {
    return null;
  }
}

function buildPrompt(systemPrompt: string, context: unknown): string {
  return `${systemPrompt}\nRespond with only a single JSON object matching the requested fields.\nContext: ${JSON.stringify({ context })}`;
}

abstract class BaseLocalAiEngine implements LocalAiEngine {
  protected abstract run(systemPrompt: string, context: unknown): Promise<unknown>;

  async generateStepNotes(input: AiStepNotesEnhancementRequest): Promise<AiStepNotesEnhancementResponse> {
    const raw = await this.run(AI_STEP_NOTES_SYSTEM_PROMPT, sanitizeStepNotesInput(input)).catch(() => null);
    const output = AiStepNotesProviderOutputSchema.safeParse(raw);
    if (!output.success) return { notes: input.existingNotes, source: "deterministic", fallbackReason: "invalid-output" };
    return { notes: output.data.notes, source: "ai", fallbackReason: null };
  }

  async generateIntroduction(input: AiIntroductionEnhancementRequest): Promise<AiIntroductionEnhancementResponse> {
    const raw = await this.run(AI_INTRODUCTION_SYSTEM_PROMPT, sanitizeIntroductionInput(input)).catch(() => null);
    const output = AiIntroductionProviderOutputSchema.safeParse(raw);
    if (!output.success) return { introduction: input.existingIntroduction, source: "deterministic", fallbackReason: "invalid-output" };
    return { introduction: output.data.introduction, source: "ai", fallbackReason: null };
  }
}

class BrowserPromptEngine extends BaseLocalAiEngine {
  constructor(private readonly model: BrowserLanguageModelApi) {
    super();
  }

  protected async run(systemPrompt: string, context: unknown): Promise<unknown> {
    const session = await this.model.create();
    try {
      return parseJsonObject(await session.prompt(buildPrompt(systemPrompt, context)));
    } finally {
      session.destroy();
    }
  }
}

class WebLlmEngine extends BaseLocalAiEngine {
  constructor(private readonly engine: import("@mlc-ai/web-llm").MLCEngineInterface) {
    super();
  }

  protected async run(systemPrompt: string, context: unknown): Promise<unknown> {
    const completion = await this.engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify({ context }) },
      ],
      temperature: 0.2,
    });
    return parseJsonObject(completion.choices[0]?.message?.content ?? "");
  }
}

// A small instruct model to keep the one-time download as light as reasonably possible.
const WEBLLM_MODEL_ID = "Phi-3.5-mini-instruct-q4f16_1-MLC";

/**
 * Tries Chrome's on-device Prompt API first (no download, highest privacy, lowest resource use),
 * then falls back to WebLLM over WebGPU. Returns null when neither is usable on this browser/device.
 */
export async function createLocalAiEngine(
  onDownloadProgress?: (progress: LocalAiDownloadProgress) => void,
): Promise<LocalAiEngine | null> {
  const browserModel = getBrowserLanguageModel();
  if (browserModel) {
    try {
      if ((await browserModel.availability()) !== "unavailable") return new BrowserPromptEngine(browserModel);
    } catch {
      // Fall through to the WebLLM fallback below.
    }
  }

  if (!("gpu" in navigator)) return null;

  try {
    const webllm = await import("@mlc-ai/web-llm");
    const engine = await webllm.CreateMLCEngine(WEBLLM_MODEL_ID, {
      initProgressCallback: (report) => onDownloadProgress?.({ progress: report.progress, text: report.text }),
    });
    return new WebLlmEngine(engine);
  } catch {
    return null;
  }
}

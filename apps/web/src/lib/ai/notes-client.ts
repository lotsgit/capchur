import {
  AiIntroductionEnhancementResponseSchema,
  AiStepNotesEnhancementResponseSchema,
  type AiIntroductionEnhancementRequest,
  type AiIntroductionEnhancementResponse,
  type AiProcessingMode,
  type AiStepNotesEnhancementRequest,
  type AiStepNotesEnhancementResponse,
} from "@/lib/contracts";

import { createLocalAiEngine, type LocalAiDownloadProgress, type LocalAiEngine } from "./local-engine";

let localEnginePromise: Promise<LocalAiEngine | null> | null = null;

function getLocalEngine(onDownloadProgress?: (progress: LocalAiDownloadProgress) => void) {
  localEnginePromise ??= createLocalAiEngine(onDownloadProgress);
  return localEnginePromise;
}

export async function enhanceStepNotes(
  processingMode: AiProcessingMode,
  input: AiStepNotesEnhancementRequest,
  onDownloadProgress?: (progress: LocalAiDownloadProgress) => void,
): Promise<AiStepNotesEnhancementResponse> {
  if (processingMode === "online") {
    const response = await fetch("/api/ai/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("AI notes request failed");
    return AiStepNotesEnhancementResponseSchema.parse(await response.json());
  }

  const engine = await getLocalEngine(onDownloadProgress);
  if (!engine) return { notes: input.existingNotes, source: "deterministic", fallbackReason: "not-configured" };
  return engine.generateStepNotes(input);
}

export async function enhanceIntroduction(
  processingMode: AiProcessingMode,
  input: AiIntroductionEnhancementRequest,
  onDownloadProgress?: (progress: LocalAiDownloadProgress) => void,
): Promise<AiIntroductionEnhancementResponse> {
  if (processingMode === "online") {
    const response = await fetch("/api/ai/introduction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("AI introduction request failed");
    return AiIntroductionEnhancementResponseSchema.parse(await response.json());
  }

  const engine = await getLocalEngine(onDownloadProgress);
  if (!engine) return { introduction: input.existingIntroduction, source: "deterministic", fallbackReason: "not-configured" };
  return engine.generateIntroduction(input);
}

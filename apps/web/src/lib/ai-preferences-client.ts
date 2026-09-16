import {
  AiPreferencesResponseSchema,
  AiPreferencesSchema,
  type AiPreferences,
  type AiPreferencesWrite,
} from "@/lib/contracts";

const AI_PREFERENCES_ENDPOINT = "/api/settings/ai-preferences";

export async function loadAiPreferences(): Promise<AiPreferences | null> {
  const response = await fetch(AI_PREFERENCES_ENDPOINT);
  if (!response.ok) throw new Error("Failed to load AI preferences");
  return AiPreferencesResponseSchema.parse(await response.json()).preferences;
}

export async function saveAiPreferences(write: AiPreferencesWrite): Promise<AiPreferences> {
  const response = await fetch(AI_PREFERENCES_ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(write),
  });
  if (!response.ok) throw new Error("Failed to save AI preferences");
  const parsed = AiPreferencesResponseSchema.parse(await response.json()).preferences;
  return AiPreferencesSchema.parse(parsed);
}

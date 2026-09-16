import { getAiStepNotesApi } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  return (await getAiStepNotesApi()).enhance(request);
}

import { getAiDescriptionApi } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  return (await getAiDescriptionApi()).enhance(request);
}
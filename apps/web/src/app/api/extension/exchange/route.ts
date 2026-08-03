import { getExtensionApi } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  return (await getExtensionApi()).exchange(request);
}
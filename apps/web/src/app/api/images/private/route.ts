import { getPersistenceApi } from "@/server/runtime";

export async function GET(request: Request): Promise<Response> {
  return (await getPersistenceApi()).privateImage(request);
}
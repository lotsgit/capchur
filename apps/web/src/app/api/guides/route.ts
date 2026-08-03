import { getPersistenceApi } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  return (await getPersistenceApi()).guides(request);
}
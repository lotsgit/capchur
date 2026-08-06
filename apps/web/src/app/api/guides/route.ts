import { getPersistenceApi } from "@/server/runtime";

export async function GET(request: Request): Promise<Response> {
  return (await getPersistenceApi()).guides(request);
}

export async function POST(request: Request): Promise<Response> {
  return (await getPersistenceApi()).guides(request);
}
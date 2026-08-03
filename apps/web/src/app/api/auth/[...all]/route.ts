import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/runtime";

const handlers = toNextJsHandler(async (request) => (await getAuth()).handler(request));

export const GET = handlers.GET;
export const POST = handlers.POST;
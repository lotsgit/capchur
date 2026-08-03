import { timingSafeEqual } from "node:crypto";

export class ApiAuthenticator {
  constructor(private readonly identities: ReadonlyMap<string, string>) {}

  authenticate(request: Request): string | null {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return null;
    }

    const provided = Buffer.from(authorization.slice("Bearer ".length));
    for (const [token, ownerId] of this.identities) {
      const expected = Buffer.from(token);
      if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
        return ownerId;
      }
    }

    return null;
  }
}

export function createEnvironmentAuthenticator(): ApiAuthenticator {
  const value = process.env.CAPCHUR_API_TOKENS;
  if (!value) {
    throw new Error("CAPCHUR_API_TOKENS is required");
  }

  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CAPCHUR_API_TOKENS must be a JSON token-to-owner object");
  }

  const identities = new Map<string, string>();
  for (const [token, ownerId] of Object.entries(parsed)) {
    if (token.length < 32 || typeof ownerId !== "string" || ownerId.trim().length === 0) {
      throw new Error("API tokens must have at least 32 characters and a non-empty owner");
    }
    identities.set(token, ownerId);
  }

  return new ApiAuthenticator(identities);
}
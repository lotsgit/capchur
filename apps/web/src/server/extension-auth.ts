import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import type { WorkspacePrincipal } from "./auth";
import type { DatabaseHandle } from "./db";
import {
  extensionAccessTokens,
  extensionAuthorizationCodes,
} from "./db/schema";

const AUTHORIZATION_CODE_LIFETIME_MS = 5 * 60 * 1_000;
const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1_000;

function hashCredential(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createCredential(): string {
  return randomBytes(32).toString("base64url");
}

export class ExtensionAuthorizationService {
  constructor(
    private readonly database: DatabaseHandle["database"],
    private readonly now: () => number = Date.now,
  ) {}

  async issueCode(principal: WorkspacePrincipal): Promise<string> {
    const code = createCredential();
    await this.database.insert(extensionAuthorizationCodes).values({
      codeHash: hashCredential(code),
      ...principal,
      expiresAt: this.now() + AUTHORIZATION_CODE_LIFETIME_MS,
    });
    return code;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; expiresAt: number } | null> {
    const [grant] = await this.database
      .delete(extensionAuthorizationCodes)
      .where(eq(extensionAuthorizationCodes.codeHash, hashCredential(code)))
      .returning();
    if (!grant || grant.expiresAt <= this.now()) return null;

    const accessToken = createCredential();
    const expiresAt = this.now() + ACCESS_TOKEN_LIFETIME_MS;
    await this.database.insert(extensionAccessTokens).values({
      tokenHash: hashCredential(accessToken),
      userId: grant.userId,
      workspaceId: grant.workspaceId,
      role: grant.role,
      expiresAt,
    });
    return { accessToken, expiresAt };
  }

  async authenticateToken(token: string): Promise<WorkspacePrincipal | null> {
    const [credential] = await this.database
      .select()
      .from(extensionAccessTokens)
      .where(eq(extensionAccessTokens.tokenHash, hashCredential(token)))
      .limit(1);
    if (!credential || credential.expiresAt <= this.now()) return null;
    return {
      userId: credential.userId,
      workspaceId: credential.workspaceId,
      role: credential.role,
    };
  }
}
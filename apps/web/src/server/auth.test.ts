// @vitest-environment node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "./auth";
import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { ExtensionAuthorizationService } from "./extension-auth";

function authRequest(path: string, body?: unknown, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  if (!value) throw new Error("Authentication did not issue a session cookie");
  return value;
}

describe("authentication", () => {
  let client: PGlite;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    client = new PGlite();
    for (const migrationName of [
      "0000_persistence.sql",
      "0001_pale_machine_man.sql",
      "0002_fair_puff_adder.sql",
      "0003_misty_umar.sql",
      "0004_known_bishop.sql",
    ]) {
      const migration = await readFile(join(process.cwd(), "drizzle", migrationName), "utf8");
      await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    handle = { kind: "local", database: drizzle(client, { schema }) };
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it("creates an owner workspace and enforces sign-in, sign-out, and expiry", async () => {
    const auth = createAuth(handle);
    const credentials = {
      email: "owner@example.test",
      password: "correct-horse-battery-staple",
      name: "Workspace Owner",
    };
    const signUp = await auth.handler(authRequest("/api/auth/sign-up/email", credentials));
    expect(signUp.status).toBe(200);
    const firstCookie = sessionCookie(signUp);
    const signedUp = await signUp.json();

    const memberships = await handle.database
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, signedUp.user.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");

    const current = await auth.handler(authRequest("/api/auth/get-session", undefined, firstCookie));
    expect((await current.json()).user.email).toBe(credentials.email);

    const signOut = await auth.handler(authRequest("/api/auth/sign-out", {}, firstCookie));
    expect(signOut.status).toBe(200);
    const revoked = await auth.handler(authRequest("/api/auth/get-session", undefined, firstCookie));
    expect(await revoked.json()).toBeNull();

    const signIn = await auth.handler(authRequest("/api/auth/sign-in/email", {
      email: credentials.email,
      password: credentials.password,
    }));
    expect(signIn.status).toBe(200);
    const secondCookie = sessionCookie(signIn);
    await handle.database
      .update(schema.session)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.session.userId, signedUp.user.id));

    const expired = await auth.handler(authRequest("/api/auth/get-session", undefined, secondCookie));
    expect(await expired.json()).toBeNull();
  }, 60_000);

  it("consumes authorization codes once and expires hashed extension tokens", async () => {
    let currentTime = 1_000;
    const service = new ExtensionAuthorizationService(handle.database, () => currentTime);
    const principal = { userId: "extension-user", workspaceId: "workspace-a", role: "owner" as const };
    await handle.database.insert(schema.user).values({
      id: principal.userId,
      name: "Ada Lovelace",
      email: "ada-extension@example.com",
    });
    const code = await service.issueCode(principal);
    const credential = await service.exchangeCode(code);

    expect(credential?.accessToken).toHaveLength(43);
    expect(credential?.userName).toBe("Ada Lovelace");
    expect(await service.exchangeCode(code)).toBeNull();
    expect(await service.authenticateToken(credential?.accessToken ?? "")).toEqual(principal);
    const stored = await handle.database.select().from(schema.extensionAccessTokens);
    expect(stored[0]?.tokenHash).not.toBe(credential?.accessToken);

    currentTime = credential?.expiresAt ?? currentTime;
    expect(await service.authenticateToken(credential?.accessToken ?? "")).toBeNull();
  });
});
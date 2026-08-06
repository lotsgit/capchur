import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, asc, eq } from "drizzle-orm";

import type { DatabaseHandle } from "./db";
import * as schema from "./db/schema";
import { workspaceMembers, workspaces } from "./db/schema";

export interface AuthSession {
  user: { id: string; name: string; email: string };
  session: { id: string; expiresAt: Date };
}

export interface SessionReader {
  getSession(headers: Headers): Promise<AuthSession | null>;
}

export interface WorkspacePrincipal {
  userId: string;
  workspaceId: string;
  role: schema.WorkspaceRole;
}

export interface ExtensionTokenReader {
  authenticateToken(token: string): Promise<WorkspacePrincipal | null>;
}

type Database = DatabaseHandle["database"];

async function createDefaultWorkspace(database: Database, userId: string, name: string) {
  const workspaceId = randomUUID();
  await database.transaction(async (transaction) => {
    await transaction.insert(workspaces).values({
      id: workspaceId,
      name: `${name}'s workspace`,
      slug: `workspace-${workspaceId}`,
    });
    await transaction.insert(workspaceMembers).values({
      id: randomUUID(),
      workspaceId,
      userId,
      role: "owner",
    });
  });
}

async function sendPasswordResetEmail(input: { user: { email: string; name: string }; url: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CAPCHUR_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Password reset email delivery is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.user.email],
      subject: "Reset your Capchur password",
      text: `Hello ${input.user.name},\n\nReset your Capchur password using this one-time link:\n${input.url}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
    }),
  });
  if (!response.ok) throw new Error("Password reset email delivery failed");
}

export function createAuth(handle: DatabaseHandle) {
  const database = handle.database;
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? (
      process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"
    ),
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 30 * 60,
      sendResetPassword: ({ user, url }) => sendPasswordResetEmail({ user, url }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            await createDefaultWorkspace(database, createdUser.id, createdUser.name);
          },
        },
      },
    },
  });
}

export class WorkspaceAuthenticator {
  constructor(
    private readonly sessions: SessionReader,
    private readonly database: Database,
    private readonly extensionTokens?: ExtensionTokenReader,
  ) {}

  async authenticate(request: Request): Promise<WorkspacePrincipal | null> {
    const authorization = request.headers.get("authorization");
    if (authorization?.startsWith("Bearer ") && this.extensionTokens) {
      const principal = await this.extensionTokens.authenticateToken(
        authorization.slice("Bearer ".length),
      );
      if (principal) return principal;
    }

    const authSession = await this.sessions.getSession(request.headers);
    if (!authSession || authSession.session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const requestedWorkspaceId = request.headers.get("x-capchur-workspace-id");
    const memberships = await this.database
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .where(
        requestedWorkspaceId
          ? and(
              eq(workspaceMembers.userId, authSession.user.id),
              eq(workspaceMembers.workspaceId, requestedWorkspaceId),
            )
          : eq(workspaceMembers.userId, authSession.user.id),
      )
      .orderBy(asc(workspaceMembers.createdAt))
      .limit(1);
    const membership = memberships[0];

    return membership ? {
      userId: authSession.user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    } : null;
  }
}
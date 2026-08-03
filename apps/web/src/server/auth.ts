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
  ) {}

  async authenticate(request: Request): Promise<WorkspacePrincipal | null> {
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
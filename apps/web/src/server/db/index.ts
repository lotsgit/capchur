import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "./schema";

export type LocalDatabase = ReturnType<typeof drizzlePglite<typeof schema>>;
export type RemoteDatabase = ReturnType<typeof drizzlePostgres<typeof schema>>;

export type CapchurDatabase = LocalDatabase | RemoteDatabase;

export type DatabaseHandle =
  | { kind: "local"; database: LocalDatabase }
  | { kind: "remote"; database: RemoteDatabase };

const globalDatabase = globalThis as typeof globalThis & {
  capchurDatabase?: Promise<DatabaseHandle>;
};

async function createDatabase(): Promise<DatabaseHandle> {
  const migrationsFolder = join(process.cwd(), "drizzle");
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const client = postgres(databaseUrl, {
      max: 10,
      prepare: false,
    });
    const database = drizzlePostgres(client, { schema });
    await migratePostgres(database, { migrationsFolder });
    return { kind: "remote", database };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }

  const dataDirectory = process.env.CAPCHUR_DATA_DIR ?? join(process.cwd(), ".data");
  const client = new PGlite(join(dataDirectory, "postgres"));
  const database = drizzlePglite(client, { schema });
  await migratePglite(database, { migrationsFolder });
  return { kind: "local", database };
}

export function getDatabase(): Promise<DatabaseHandle> {
  globalDatabase.capchurDatabase ??= createDatabase();
  return globalDatabase.capchurDatabase;
}
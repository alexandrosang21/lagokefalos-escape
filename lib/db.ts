import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const isDbConfigured = Boolean(process.env.DATABASE_URL);

const url = process.env.DATABASE_URL ?? "";

// Neon's HTTP driver only talks to Neon's proxy; use node-postgres for any
// other Postgres (local dev, docker, etc). Both expose the same drizzle query
// API, so the neon variant is cast to the node-postgres type — a union type
// here would break drizzle's method overloads.
export const db: NodePgDatabase<typeof schema> = url.includes("neon.tech")
  ? (drizzleNeon(neon(url), { schema }) as unknown as NodePgDatabase<typeof schema>)
  : drizzlePg(new Pool({ connectionString: url || undefined }), { schema });

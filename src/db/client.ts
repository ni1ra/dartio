import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseEnv } from "@/lib/env/server";
import * as schema from "./schema";

export function createDatabase() { const sql = neon(getDatabaseEnv().DATABASE_URL); return drizzle(sql, { schema }); }

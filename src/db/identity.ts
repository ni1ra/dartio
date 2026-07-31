import { sql } from "drizzle-orm";
import { createDatabase } from "./client";
import { isUniqueViolation } from "./errors";
import {
  IdentityConflictError,
  type InternalUser,
  type NormalizedIdentity,
  type UserIdentityStore,
} from "@/lib/server/identity";

interface IdentityRow extends Record<string, unknown> {
  id: string;
  authSubject: string;
  email: string;
  stripeCustomerId: string | null;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
}

type IdentityExecutor = (identity: NormalizedIdentity) => Promise<readonly IdentityRow[]>;

export function createPostgresIdentityStore(execute: IdentityExecutor = executeIdentityQuery): UserIdentityStore {
  return {
    async resolve(identity) {
      try {
        const row = (await execute(identity))[0];
        if (!row) throw new IdentityConflictError();
        return toInternalUser(row);
      } catch (error) {
        if (error instanceof IdentityConflictError) throw error;
        if (isUniqueViolation(error)) throw new IdentityConflictError({ cause: error });
        throw error;
      }
    },
  };
}

async function executeIdentityQuery(identity: NormalizedIdentity): Promise<readonly IdentityRow[]> {
  const result = await createDatabase().execute<IdentityRow>(sql`
    with resolved_user as (
      insert into users (auth_subject, email)
      values (${identity.subject}, ${identity.email})
      on conflict (auth_subject) do update
      set email = excluded.email, updated_at = now()
      where users.email = excluded.email
         or not exists (
           select 1
           from users as email_owner
           where email_owner.email = excluded.email
             and email_owner.id <> users.id
         )
      returning id, auth_subject, email, stripe_customer_id
    ), resolved_profile as (
      insert into profiles (user_id, display_name, avatar_url)
      select id, ${identity.displayName}, ${identity.avatarUrl}
      from resolved_user
      on conflict (user_id) do update set user_id = excluded.user_id
      returning user_id, display_name, avatar_url, preferences
    )
    select
      resolved_user.id,
      resolved_user.auth_subject as "authSubject",
      resolved_user.email,
      resolved_user.stripe_customer_id as "stripeCustomerId",
      resolved_profile.user_id as "userId",
      resolved_profile.display_name as "displayName",
      resolved_profile.avatar_url as "avatarUrl",
      resolved_profile.preferences
    from resolved_user
    inner join resolved_profile on resolved_profile.user_id = resolved_user.id
  `);
  return result.rows;
}

function toInternalUser(row: IdentityRow): InternalUser {
  return {
    id: row.id,
    authSubject: row.authSubject,
    email: row.email,
    stripeCustomerId: row.stripeCustomerId,
    profile: {
      userId: row.userId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      preferences: row.preferences,
    },
  };
}

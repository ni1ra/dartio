#!/usr/bin/env node
/*
 * Read-only room integrity audit. It prints counts only: never row ids, account
 * data, or the connection string. DATABASE_URL selects Preview or Production;
 * the optional argument is merely the human-readable environment label.
 */

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const label = process.argv[2] ?? "database";
if (!databaseUrl) {
  console.error("usage: DATABASE_URL=<url> pnpm verify:rooms:integrity [label]");
  process.exit(2);
}

const sql = neon(databaseUrl);
const [counts] = await sql`
  select
    (
      select count(*)::int from (
        select r.id
        from rooms r
        left join room_members rm on rm.room_id = r.id
        group by r.id, r.owner_user_id
        having count(*) filter (where rm.role = 'owner') <> 1
          or count(*) filter (
            where rm.role = 'owner' and rm.user_id = r.owner_user_id
          ) <> 1
      ) owner_drift
    ) as "ownerAnomalies",
    (
      select count(*)::int
      from matches m
      where m.room_id is not null and (
        m.state_version <> (select count(*)::int from turns t where t.match_id = m.id)
        or m.state_version <> coalesce((select max(t.turn_number) from turns t where t.match_id = m.id), 0)
      )
    ) as "versionAnomalies",
    (
      select count(*)::int from matches m
      where m.room_id is not null and m.status = 'abandoned'
        and (m.winner_player_id is not null or m.completed_at is not null)
    ) as "abandonedFieldAnomalies",
    (
      select count(*)::int from matches m
      where m.room_id is not null and m.status = 'complete' and m.completed_at is null
    ) as "completeFieldAnomalies",
    (
      select count(*)::int from matches m
      where m.room_id is not null and m.status in ('pending', 'active')
        and (m.winner_player_id is not null or m.completed_at is not null)
    ) as "openFieldAnomalies",
    (
      select count(*)::int from matches m
      where m.room_id is null and m.status in ('pending', 'active')
    ) as "orphanedOpenMatches",
    (
      select count(*)::int from matches m
      where m.room_id is null and (
        select count(*) from players p where p.match_id = m.id and p.user_id is not null
      ) >= 2
    ) as "orphanedMultiUserMatches"
`;

const liveAnomalies = counts.ownerAnomalies
  + counts.versionAnomalies
  + counts.abandonedFieldAnomalies
  + counts.completeFieldAnomalies
  + counts.openFieldAnomalies;

console.log(
  `ROOM INTEGRITY ${label}: owner=${counts.ownerAnomalies}, version=${counts.versionAnomalies}, `
  + `abandoned_fields=${counts.abandonedFieldAnomalies}, complete_fields=${counts.completeFieldAnomalies}, `
  + `open_fields=${counts.openFieldAnomalies}`,
);
console.log(
  `HISTORICAL ORPHAN SIGNATURES ${label}: open=${counts.orphanedOpenMatches}, `
  + `multi_user=${counts.orphanedMultiUserMatches}`,
);

if (liveAnomalies !== 0) {
  console.error(`FAIL ${label} has ${liveAnomalies} surviving room integrity anomaly/anomalies`);
  process.exit(1);
}
console.log(`OK   ${label} surviving rooms satisfy the lifecycle invariants`);

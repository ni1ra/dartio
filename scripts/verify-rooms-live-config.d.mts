export const PREVIEW_DATABASE_HOST: string;

export type LiveRoomConfiguration =
  | { ok: true; origin: string; databaseUrl: string }
  | { ok: false; message: string };

export function resolveLiveRoomConfiguration(
  arguments_: string[],
  readEnvironment: () => string,
): LiveRoomConfiguration;

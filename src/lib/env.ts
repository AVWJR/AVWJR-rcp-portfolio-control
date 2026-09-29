/**
 * Environment values the app reads. A subset is valid, so tests can pass
 * `{ SEED_SECRET: "..." }` without inventing `NODE_ENV`. `process.env` satisfies this.
 */
export type AppEnv = {
  [key: string]: string | undefined;
};

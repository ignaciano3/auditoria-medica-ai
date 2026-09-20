function databaseName(raw: string): string | undefined {
  try {
    const name = new URL(raw).pathname.replace(/^\//, "");
    return name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const url = env.TEST_DATABASE_URL?.trim();
  if (!url) return undefined;

  const name = databaseName(url);
  if (!name) {
    throw new Error(
      "TEST_DATABASE_URL is not a valid Postgres connection URL.",
    );
  }
  if (!name.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must point at a database whose name ends in "_test" (got "${name}"). ` +
        "Repository tests delete rows; never point them at the development database.",
    );
  }
  const devName = env.DATABASE_URL ? databaseName(env.DATABASE_URL) : undefined;
  if (devName === name) {
    throw new Error(
      `TEST_DATABASE_URL points at the development database "${name}". ` +
        "Use a dedicated test database instead.",
    );
  }
  return url;
}

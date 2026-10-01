import { RuntimeService } from "#common/runtimeConfig.js";

/**
 * Terminates a process which failed to start, e.g. on a database connection or schema
 * synchronization error. A non-zero exit code makes the failure visible to Docker and the
 * deploy, instead of leaving a running process which serves nothing. Only the error message
 * is printed, never the error object, so connection settings do not leak into the output.
 * @param service Service which failed to start
 * @param error Error which interrupted the start
 * @returns Never, the process exits with code 1
 */
export function exitOnStartupError(service: RuntimeService, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${service} failed to start: ${message}`);
  process.exit(1);
}

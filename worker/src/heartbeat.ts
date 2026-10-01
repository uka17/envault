import fs from "fs";

/**
 * Records that the worker made progress just now. The file holds the time of the last
 * successful database round trip of the delivery loop and is read by the container health check.
 * @param file Path of the heartbeat file
 * @param now Current time in milliseconds, `Date.now()` by default
 * @returns Nothing
 */
export function writeHeartbeat(file: string, now: number = Date.now()): void {
  fs.writeFileSync(file, String(now));
}

/**
 * Removes a heartbeat left by a previous process. Called at start, so a worker which fails
 * to start or restarts in a loop is never reported alive because of an old file.
 * @param file Path of the heartbeat file
 * @returns Nothing
 */
export function clearHeartbeat(file: string): void {
  fs.rmSync(file, { force: true });
}

/**
 * Checks whether the worker made progress recently. A missing or unreadable heartbeat counts
 * as stale: the worker has not completed a single database round trip since it started.
 * @param file Path of the heartbeat file
 * @param staleAfterMs Age after which the heartbeat is considered stale
 * @param now Current time in milliseconds, `Date.now()` by default
 * @returns `true` if the last heartbeat is not older than `staleAfterMs`
 */
export function isHeartbeatFresh(file: string, staleAfterMs: number, now: number = Date.now()): boolean {
  let content: string;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const beatAt = Number(content);
  return content.trim() !== "" && Number.isFinite(beatAt) && now - beatAt <= staleAfterMs;
}

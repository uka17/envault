import config from "worker/src/config/config.js";
import { isHeartbeatFresh } from "worker/src/heartbeat.js";

// Container health check of the worker: exit code 0 while the delivery loop makes progress,
// 1 when it is stopped, stuck or cannot reach the database. See docs in worker/src/heartbeat.ts.
if (!isHeartbeatFresh(config.heartbeat.file, config.heartbeat.staleAfterMs)) {
  console.error(`Worker made no progress in the last ${config.heartbeat.staleAfterMs} ms`);
  process.exit(1);
}

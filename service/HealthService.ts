import { DataSource } from "typeorm";
import { injectable, inject } from "tsyringe";

import { TOKENS } from "#di/tokens.js";
import LogService from "#service/LogService.js";

@injectable()
export default class HealthService {
  /**
   * Creates instance of `HealthService`
   * @param dataSource Data source of the process, used to probe the database
   * @param logger Logger service
   * @returns Health service
   */
  constructor(
    @inject(TOKENS.DataSource) private dataSource: DataSource,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Checks that the database answers a trivial query in time. A slow database counts as
   * unavailable, so a hanging connection cannot keep the readiness probe waiting.
   * @param timeoutMs Maximum time to wait for the database answer
   * @returns `true` if the database answered within the timeout
   */
  public async isDatabaseReady(timeoutMs: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Database did not answer in ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      await Promise.race([this.dataSource.query("SELECT 1"), timeout]);
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

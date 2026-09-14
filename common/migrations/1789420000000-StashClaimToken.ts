import { MigrationInterface, QueryRunner } from "typeorm";

export class StashClaimToken1789420000000 implements MigrationInterface {
  /**
   * Adds unique claim ownership independently of the stale-lock timestamp.
   * @param queryRunner Migration connection
   * @returns Nothing
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE stash ADD COLUMN claim_token uuid NULL");
  }

  /**
   * Removes claim fencing after all new workers have been stopped.
   * @param queryRunner Migration connection
   * @returns Nothing
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE stash DROP COLUMN claim_token");
  }
}

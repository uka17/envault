import { Entity, Column, PrimaryColumn, Index } from "typeorm";

/** Persistent request budget, including addresses that do not belong to an account. */
@Entity()
export default class PasswordResetLimit {
  @PrimaryColumn("text")
    emailHash: string;

  @Index()
  @Column("timestamptz")
    windowStartedAt: Date;

  @Column("integer")
    requestCount: number;
}

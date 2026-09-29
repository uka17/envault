import { Entity, Column, PrimaryColumn, Index } from "typeorm";

/** Fixed-window request counter shared by every API process, see `RateLimitService`. */
@Entity()
export default class RateLimitCounter {
  @PrimaryColumn("text")
    bucket: string;

  @PrimaryColumn("text")
    key: string;

  @Index()
  @Column("timestamptz")
    windowStartedAt: Date;

  @Column("integer")
    count: number;
}

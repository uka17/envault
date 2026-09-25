import { Entity, Column, ManyToOne, Relation } from "typeorm";
import { Exclude } from "class-transformer";
import Base from "#model/Base.js";
import User from "#model/User.js";

@Entity()
export default class Stash extends Base {
  @Column("text")
    to: string;

  @Column("text")
    body: string;

  @Column({
    type: "boolean",
    nullable: true,
    default: false,
  })
    isSent: boolean;

  @Exclude()
  @Column({
    name: "public_access_token",
    type: "varchar",
    length: 20,
    unique: true,
    nullable: true,
  })
    publicAccessToken: string;

  @ManyToOne(() => User, (user) => user.stashes)
    user: Relation<User>;

  @Column("timestamptz")
    scheduledAt: Date;

  @Column({
    name: "sent_at",
    type: "timestamptz",
    nullable: true,
  })
    sentAt: Date | null;

  @Exclude()
  @Column({
    name: "delivery_attempts",
    type: "integer",
    default: 0,
  })
    deliveryAttempts: number;

  @Exclude()
  @Column({
    name: "next_attempt_at",
    type: "timestamptz",
    nullable: true,
  })
    nextAttemptAt: Date | null;

  // Safe error category only (see EmailErrorCategory), never provider message text.
  @Exclude()
  @Column({
    name: "last_delivery_error",
    type: "varchar",
    length: 32,
    nullable: true,
  })
    lastDeliveryError: string | null;
}

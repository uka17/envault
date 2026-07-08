import { Entity, Column, ManyToOne, Relation } from "typeorm";
import { Exclude } from "class-transformer";
import Base from "#model/Base.js";
import User from "#model/User.js";

@Entity()
export default class Session extends Base {
  @ManyToOne(() => User, (user) => user.sessions)
    user: Relation<User>;

  @Exclude()
  @Column("text")
    refreshTokenHash: string;

  @Exclude()
  @Column({ type: "text", nullable: true })
    previousRefreshTokenHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
    previousTokenExpiresAt: Date | null;

  @Column("timestamptz")
    expiresAt: Date;

  @Column({ type: "timestamptz", nullable: true })
    revokedAt: Date | null;

  @Column({ type: "text", nullable: true })
    userAgent: string | null;

  @Column({ type: "text", nullable: true })
    ip: string | null;
}

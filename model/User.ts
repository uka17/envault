import { Entity, Column, OneToMany, Index } from "typeorm";
import { Exclude } from "class-transformer";
import Stash from "#model/Stash.js";
import Session from "#model/Session.js";
import Base from "#model/Base.js";

@Entity()
export default class User extends Base {
  @Index("user_email_unique", { unique: true })
  @Column("text")
    email: string;

  @Column({ type: "text", nullable: true })
    pendingEmail: string | null;

  @Exclude()
  @Index("user_email_change_token_unique", { unique: true })
  @Column({ type: "text", nullable: true })
    emailChangeTokenHash: string | null;

  @Exclude()
  @Column({ type: "timestamptz", nullable: true })
    emailChangeExpiresAt: Date | null;

  @Exclude()
  @Column({ type: "timestamptz", nullable: true })
    emailChangeLastSentAt: Date | null;

  @Exclude()
  @Column({ type: "timestamptz", nullable: true })
    emailChangeWindowStartedAt: Date | null;

  @Exclude()
  @Column({ type: "integer", default: 0 })
    emailChangeSendCount: number;

  @Exclude()
  @Column("text")
    password: string;

  @Column("text")
    name: string;

  @Column({ type: "timestamptz", nullable: true, default: () => "NOW()" })
    emailVerifiedAt: Date | null;

  @OneToMany(() => Stash, (stash) => stash.user)
    stashes: Stash[];

  @OneToMany(() => Session, (session) => session.user)
    sessions: Session[];
}

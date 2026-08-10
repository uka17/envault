import { Entity, Column, ManyToOne, Relation } from "typeorm";
import { Exclude } from "class-transformer";
import Base from "#model/Base.js";
import User from "#model/User.js";

@Entity()
export default class EmailVerification extends Base {
  @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: Relation<User>;

  @Exclude()
  @Column("text")
    codeHash: string;

  @Column("timestamptz")
    expiresAt: Date;

  @Column({ type: "timestamptz", nullable: true })
    consumedAt: Date | null;
}

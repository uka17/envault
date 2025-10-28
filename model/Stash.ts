import { Entity, Column, ManyToOne, Relation } from "typeorm";
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
  })
    isSent: boolean;

  @Column({
    type: "text",
    unique: true,
    nullable: true,
  })
    key: string;

  @ManyToOne(() => User, (user) => user.stashes)
    user: Relation<User>;

  @Column("timestamptz")
    sendAt: Date;
}

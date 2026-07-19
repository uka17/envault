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
    type: "text",
    nullable: true,
  })
    subject: string;

  @Column({
    type: "boolean",
    nullable: true,
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
    sendAt: Date;
}

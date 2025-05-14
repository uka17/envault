import { Entity, Column, ManyToOne } from "typeorm";
import Base from "model/Base";
import User from "model/User";

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
    user: User;

  @Column("timestamptz")
    sendAt: Date;
}

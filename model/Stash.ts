import { Entity, Column, IsNull, ManyToOne } from "typeorm";
import { Base } from "./Base";
import { User } from "./User";

@Entity()
export class Stash extends Base {
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

  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @Column("timestamptz")
  sendAt: Date;
}

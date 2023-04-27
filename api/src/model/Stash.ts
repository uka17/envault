import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Base } from "./Base";
import { User } from "./User";

@Entity()
export class Stash extends Base {
  @Column("text")
  to: string;

  @Column("text")
  body: string;

  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @Column("timestamptz")
  send_at: Date;
}

import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Base } from "./Base";
import { Stash } from "./Stash";

@Entity()
export class SendLog extends Base {
  @ManyToOne(() => Stash, (stash) => stash.id)
  stash: Stash;

  @Column("text")
  message_id: string;
}

import { Entity, Column, ManyToOne } from "typeorm";
import Base from "model/Base";
import Stash from "model/Stash";

@Entity()
export default class SendLog extends Base {
  @ManyToOne(() => Stash, (stash) => stash.id)
    stash: Stash;

  @Column("text")
    messageId: string;
}

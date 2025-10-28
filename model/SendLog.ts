import { Entity, Column, ManyToOne } from "typeorm";
import Base from "#model/Base.js";
import Stash from "#model/Stash.js";

@Entity()
export default class SendLog extends Base {
  @ManyToOne(() => Stash, (stash) => stash.id)
    stash: Stash;

  @Column("text")
    messageId: string;
}

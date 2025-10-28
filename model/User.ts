import { Entity, Column, OneToMany } from "typeorm";
import Stash from "#model/Stash.js";
import Base from "#model/Base.js";

@Entity()
export default class User extends Base {
  @Column("text")
    email: string;

  @Column("text")
    password: string;

  @Column("text")
    name: string;

  @OneToMany(() => Stash, (stash) => stash.user)
    stashes: Stash[];
}

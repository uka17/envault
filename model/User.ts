import { Entity, Column, OneToMany } from "typeorm";
import { Exclude } from "class-transformer";
import Stash from "#model/Stash.js";
import Base from "#model/Base.js";

@Entity()
export default class User extends Base {
  @Column("text")
    email: string;

  @Exclude()
  @Column("text")
    password: string;

  @Column("text")
    name: string;

  @Exclude()
  @Column({ type: "text", nullable: true })
    refreshToken: string | null;

  @OneToMany(() => Stash, (stash) => stash.user)
    stashes: Stash[];
}

import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import Stash from "./Stash";
import Base from "./Base";

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

import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { Stash } from "./Stash";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("text")
  email: string;

  @Column("text")
  password: string;

  @Column("text")
  name: string;

  @OneToMany(() => Stash, (stash) => stash.user)
  stash: Stash[];
}

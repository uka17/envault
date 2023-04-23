import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { TextLanguage } from "./TextLanguage";
import { User } from "./User";

@Entity()
export class Stash {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("text")
  to: string;

  @Column("text")
  body: string;

  @ManyToOne(() => User, (user) => user.id)
  user: User;
}

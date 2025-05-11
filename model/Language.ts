import { Entity, Column, OneToMany } from "typeorm";
import Translation from "./Translation";
import Base from "./Base";

@Entity()
export default class Language extends Base {
  @Column("text")
    language: string;

  @Column("text")
    code: string;

  @OneToMany(() => Translation, (translation) => translation.language)
    translations: Translation[];
}

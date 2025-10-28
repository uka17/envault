import { Entity, Column, OneToMany } from "typeorm";
import Translation from "#model/Translation.js";
import Base from "#model/Base.js";

@Entity()
export default class Language extends Base {
  @Column("text")
    language: string;

  @Column("text")
    code: string;

  @OneToMany(() => Translation, (translation) => translation.language)
    translations: Translation[];
}

import { Entity, Column, OneToMany } from "typeorm";
import Translation from "#model/Translation.js";
import Base from "#model/Base.js";

@Entity()
export default class Text extends Base {
  @Column("text")
    text: string;

  @OneToMany(() => Translation, (translations) => translations.text)
    translations: Translation[];
}

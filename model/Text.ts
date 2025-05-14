import { Entity, Column, OneToMany } from "typeorm";
import Translation from "model/Translation";
import Base from "model/Base";

@Entity()
export default class Text extends Base {
  @Column("text")
    text: string;

  @OneToMany(() => Translation, (translations) => translations.text)
    translations: Translation[];
}

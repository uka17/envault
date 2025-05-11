import { Entity, Column, OneToMany } from "typeorm";
import Translation from "./Translation";
import Base from "./Base";

@Entity()
export default class Text extends Base {
  @Column("text")
    text: string;

  @OneToMany(() => Translation, (translations) => translations.text)
    translations: Translation[];
}

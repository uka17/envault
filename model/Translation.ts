import { Entity, Column, ManyToOne } from "typeorm";
import Language from "model/Language";
import Text from "model/Text";
import Base from "model/Base";

@Entity()
export default class Translation extends Base {
  @ManyToOne(() => Text, (text) => text.id)
    text: Text;

  @ManyToOne(() => Language, (language) => language.id)
    language: Language;

  @Column("text")
    translation: string;
}

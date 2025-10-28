import { Entity, Column, ManyToOne, Relation } from "typeorm";
import Language from "#model/Language.js";
import Text from "#model/Text.js";
import Base from "#model/Base.js";

@Entity()
export default class Translation extends Base {
  @ManyToOne(() => Text, (text) => text.id)
    text: Text;

  @ManyToOne(() => Language, (language) => language.id)
    language: Relation<Language>;

  @Column("text")
    translation: string;
}

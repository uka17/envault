import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { TextLanguage } from "./TextLanguage";
import { Base } from "./Base";

@Entity()
export class Text extends Base {
  @Column("text")
  text: string;

  @OneToMany(() => TextLanguage, (translations) => translations.text)
  translations: TextLanguage[];
}

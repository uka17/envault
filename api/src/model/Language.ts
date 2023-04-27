import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { TextLanguage } from "./TextLanguage";
import { Base } from "./Base";

@Entity()
export class Language extends Base {
  @Column("text")
  language: string;

  @Column("text")
  code: string;

  @OneToMany(() => TextLanguage, (translations) => translations.language)
  translations: TextLanguage[];
}

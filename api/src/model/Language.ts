import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { TextLanguage } from "./TextLanguage";

@Entity()
export class Language {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("text")
  language: string;

  @Column("text")
  code: string;

  @OneToMany(() => TextLanguage, (translations) => translations.language)
  translations: TextLanguage[];
}

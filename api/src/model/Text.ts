import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { TextLanguage } from "./TextLanguage";

@Entity()
export class Text {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("text")
  text: string;

  @OneToMany(() => TextLanguage, (translations) => translations.text)
  translations: TextLanguage[];
}

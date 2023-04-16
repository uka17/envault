import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Language } from "./Language";
import { Text } from "./Text";

@Entity()
export class TextLanguage {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Text, (text) => text.id)
  text: Text;

  @ManyToOne(() => Language, (language) => language.id)
  language: Language;

  @Column("text")
  translation: string;
}

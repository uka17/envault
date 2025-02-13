import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  creaeted_on: Date;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  modified_on: Date;

  @Column({ type: "varchar", nullable: true, length: 255 })
  created_by: string;

  @Column({ type: "varchar", nullable: true, length: 255 })
  modified_by: string;
}

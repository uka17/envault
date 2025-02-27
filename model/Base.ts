import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  creaetedOn: Date;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  modifiedOn: Date;

  @Column({ type: "varchar", nullable: true, length: 255 })
  createdBy: string;

  @Column({ type: "varchar", nullable: true, length: 255 })
  modifiedBy: string;
}

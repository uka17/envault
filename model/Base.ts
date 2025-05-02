import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  BaseEntity as TypeORMBaseEntity,
} from "typeorm";
import User from "model/User";

@Entity()
export default abstract class BaseEntity extends TypeORMBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  creaetedOn: Date;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  modifiedOn: Date;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
  createdBy: User;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
  modifiedBy: User;
}

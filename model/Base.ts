import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  BaseEntity as TypeORMBaseEntity,
  Relation,
} from "typeorm";
import User from "#model/User.js";

@Entity()
export default abstract class BaseEntity extends TypeORMBaseEntity {
  @PrimaryGeneratedColumn()
    id: number;

  @Column({ type: "timestamptz", default: () => "NOW()" })
    creaetedOn: Date;

  @Column({ type: "timestamptz", default: () => "NOW()" })
    modifiedOn: Date;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
    createdBy: Relation<User>;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
    modifiedBy: Relation<User>;
}

import { DataSource } from "typeorm";
import { User } from "./User";
import dotenv from "dotenv";
dotenv.config();

export const appDataSource = new DataSource({
  type: "postgres",
  url: process.env.DB,
  database: "custodian",
  entities: [User],
  synchronize: true,
  logging: false,
});

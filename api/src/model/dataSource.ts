import { DataSource } from "typeorm";
import { User } from "./User";
import dotenv from "dotenv";
dotenv.config();

const appDataSource = new DataSource({
  type: "postgres",
  url: process.env.DB,
  database: "custodian",
  entities: [User],
  synchronize: true,
  logging: false,
});

export default appDataSource;

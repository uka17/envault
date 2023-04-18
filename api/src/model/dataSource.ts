import dotenv from "dotenv";
dotenv.config();
import { DataSource } from "typeorm";
import { User } from "./User";
import { Language } from "./Language";
import { TextLanguage } from "./TextLanguage";
import { Text } from "./Text";

const appDataSource = new DataSource({
  type: "postgres",
  url: process.env.DB,
  database: "custodian",
  entities: [User, Language, Text, TextLanguage],
  synchronize: true,
  logging: false,
  connectTimeoutMS: 10000,
});

export default appDataSource;

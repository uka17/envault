import dotenv from "dotenv";
dotenv.config();
import { DataSource } from "typeorm";
import { User } from "./User";
import { Language } from "./Language";
import { TextLanguage } from "./TextLanguage";
import { Text } from "./Text";
import { Stash } from "./Stash";

const appDataSource = new DataSource({
  type: "postgres",
  url: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  database: process.env.DB_NAME,
  entities: [User, Language, Text, TextLanguage, Stash],
  synchronize: true,
  logging: false,
  connectTimeoutMS: 10000,
});

export default appDataSource;

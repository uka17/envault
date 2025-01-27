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
  url: process.env.DB,
  database: "envault",
  entities: [User, Language, Text, TextLanguage, Stash],
  synchronize: true,
  logging: false,
  connectTimeoutMS: 10000,
});

export default appDataSource;

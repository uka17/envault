import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const connection: Sequelize = new Sequelize(process.env.DB);

export default connection;

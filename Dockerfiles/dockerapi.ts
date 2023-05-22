//Run docker build in this script in order to avoid expousing or ENV variables with keys
import dotenv from "dotenv";
import chalk from "chalk";
dotenv.config();
const { exec } = require("child_process");

const com = `docker build --tag uka17/custodian-api:latest . -f Dockerfiles/api --build-arg JWT_SECRET="${process.env.JWT_SECRET}" --build-arg DB="${process.env.DB}" --build-arg ENV="${process.env.ENV}" && docker push uka17/custodian-api:latest`;

console.log(`Executing: ${chalk.green(com)}...`);

exec(com, (error, stdout, stderr) => {
  if (error) {
    console.log(`error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.log(`stderr: ${stderr}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
});

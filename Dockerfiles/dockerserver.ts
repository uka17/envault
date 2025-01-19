// DEPRECATED, using AWS ECS and ECR instead
//Run docker build in this script in order to avoid expousing or ENV variables with keys
import dotenv from "dotenv";
import chalk from "chalk";
dotenv.config();
const { exec } = require("child_process");

const tag =
  "689173142787.dkr.ecr.eu-north-1.amazonaws.com/custodian-server:latest";
const host = "689173142787.dkr.ecr.eu-north-1.amazonaws.com";
const username = "AWS";
const region = "eu-north-1";
const dockerfile = "Dockerfiles/server";

const com = `aws ecr get-login-password --region ${region} | docker login --username ${username} --password-stdin ${host} && docker build --tag ${tag} . -f ${dockerfile} --build-arg JWT_SECRET="${process.env.JWT_SECRET}" --build-arg DB="${process.env.DB}" --build-arg ENV="${process.env.ENV}" --build-arg MAILAPI="${process.env.MAILAPI}" && docker push ${tag}`;

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

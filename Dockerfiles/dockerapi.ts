//Run docker build in this script in order to avoid expousing or ENV variables with keys
import dotenv from "dotenv";
import chalk from "chalk";
dotenv.config();
const { exec } = require("child_process");

const repo = "713881789926.dkr.ecr.eu-north-1.amazonaws.com/custodian:latest";
const tag = "custodian-api:latest";
const host = "713881789926.dkr.ecr.eu-north-1.amazonaws.com ";
const username = "AWS";
const region = "eu-north-1";
const dockerfile = "Dockerfiles/api";

const com = `aws ecr get-login-password --region ${region} | docker login --username ${username} --password-stdin ${host} && docker build --tag ${tag} . -f ${dockerfile} --build-arg JWT_SECRET="${process.env.JWT_SECRET}" --build-arg DB="${process.env.DB}" --build-arg ENV="${process.env.ENV}" && docker push ${repo}`;

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

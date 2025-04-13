import swaggerAutogen from "swagger-autogen";
import fs from "fs";
import chalk from "chalk";
import config from "../config/config";

const doc = {
  info: {
    title: "Envault API",
    description: "API for envault application",
  },
  host: `${config.currentIp()}:${config.port}`,
  schemes: ["http"],
};

const routeFolder = "./api/src/route";
const fileList = [];
const fileExclude = ["validator"];
fs.readdir(routeFolder, (err, files) => {
  if (files) {
    //Generate file list
    for (let i = 0; i < files.length; i++) {
      //TODO mark route files in order to segreagate them
      if (fileExclude.includes(files[i])) continue;
      fileList.push(`../route/${files[i]}`);
      console.log(
        chalk.green(`File ../route/${files[i]} with route definition found`)
      );
    }
    //Generate swagger file
    const outputFile = "./swagger.json";
    const endpointFiles = fileList;

    swaggerAutogen(outputFile, endpointFiles, doc);
  } else
    console.error(
      chalk.red(`No files with routes definition found at ${routeFolder}`)
    );
});

import swaggerAutogen from "swagger-autogen";
import * as fs from "fs";
import chalk from "chalk";
import config from "api/src/config/config.js";

const doc = {
  info: {
    title: "Envault API",
    description: "API for envault application",
  },
  host: `${config.currentIp()}:${config.port}`,
  schemes: ["http"],
};

const routeFolder = "out/api/src/route";
const fileList = [];
const fileExclude = ["validator"];
fs.readdir(routeFolder, (err, files) => {
  if (files) {
    //Generate file list
    for (let i = 0; i < files.length; i++) {
      //TODO mark route files in order to segreagate them
      if (fileExclude.includes(files[i]) || files[i].endsWith(".map")) {
        continue;
      }
      fileList.push(`../route/${files[i]}`);
      console.log(
        chalk.green(`File ../route/${files[i]} with route definition found`),
      );
    }
    //Generate swagger file
    const outputFile = "./swagger.json";

    swaggerAutogen(outputFile, fileList, doc);
  } else {
    console.error(
      chalk.red(`No files with routes definition found at ${routeFolder}`),
    );
  }
});

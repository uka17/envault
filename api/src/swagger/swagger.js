const swaggerAutogen = require("swagger-autogen")();
const fs = require("fs");
const chalk = require("chalk");

const doc = {
  info: {
    title: "Custodian API",
    description: "API for custodian application",
  },
  host: "localhost:8080",
  schemes: ["http"],
};

const routeFolder = "./src/route";
const fileList = [];

fs.readdir(routeFolder, (err, files) => {
  if (files) {
    //Generate file list
    for (let i = 0; i < files.length; i++) {
      //TODO mark route files in order to segreagate them
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

import swaggerAutogen from "swagger-autogen";
import * as fs from "fs";
import chalk from "chalk";
import config from "api/src/config/config.js";

const doc = {
  info: {
    title: "Envault API",
    description: "REST API for the Envault application — secure stash management with email delivery via AWS SES.",
    version: "1.0.0",
  },
  servers: [
    {
      url: `http://${config.currentIp()}:${config.port}`,
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token. Format: **Bearer &lt;token&gt;**",
      },
    },
  },
  definitions: {
    // swagger-autogen shorthand: $ prefix = required field, value = example
    UserCreateRequest: {
      $email: "john@mail.com",
      $password: "Secret@123",
      $name: "John Doe",
    },
    UserLoginRequest: {
      $email: "john@mail.com",
      $password: "Secret@123",
    },
    UserResponse: {
      id: 1,
      email: "john@mail.com",
      name: "John Doe",
      createdOn: "2025-01-01T00:00:00Z",
      modifiedOn: "2025-01-01T00:00:00Z",
    },
    TokenResponse: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    },
    StashCreateRequest: {
      $body: "Secret message to deliver",
      $to: "journalist@fakemail.com",
      $sendAt: "2025-12-31T23:59:59Z",
    },
    StashResponse: {
      id: 42,
      to: "journalist@fakemail.com",
      body: "<encrypted>",
      key: "abc123xyz",
      isSent: false,
      sendAt: "2025-12-31T23:59:59Z",
      createdOn: "2025-01-01T00:00:00Z",
      modifiedOn: "2025-01-01T00:00:00Z",
    },
    SessionResponse: {
      id: 7,
      expiresAt: "2025-12-31T23:59:59Z",
      revokedAt: null,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      ip: "203.0.113.42",
      createdOn: "2025-01-01T00:00:00Z",
      modifiedOn: "2025-01-01T00:00:00Z",
      current: true,
    },
    ErrorResponse: {
      error: "Unauthorized",
    },
    ValidationErrorResponse: {
      errors: [{ field: "email", message: "must be a valid email" }],
    },
  },
};

const routeFolder = "dist/api/src/route";
const controllerFolder = "dist/api/src/controller";
const fileList = [];
const fileExclude = ["validator"];

function readFolder(folder: string, prefix: string, done: () => void) {
  fs.readdir(folder, (err, files) => {
    if (files) {
      for (let i = 0; i < files.length; i++) {
        if (fileExclude.includes(files[i]) || files[i].endsWith(".map")) {
          continue;
        }
        fileList.push(`${prefix}/${files[i]}`);
        console.log(chalk.green(`File ${prefix}/${files[i]} found`));
      }
    } else {
      console.error(chalk.red(`No files found at ${folder}`));
    }
    done();
  });
}

readFolder(routeFolder, "../route", () => {
  readFolder(controllerFolder, "../controller", () => {
    const outputFile = "./swagger.json";
    swaggerAutogen({ openapi: "3.0.0" })(outputFile, fileList, doc);
  });
});

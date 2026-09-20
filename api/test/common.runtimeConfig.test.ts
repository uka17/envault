import { expect } from "chai";
import sinon from "sinon";

import { getRuntimeConfigErrors, validateRuntimeConfigOrExit } from "#common/runtimeConfig.js";

const validDev: NodeJS.ProcessEnv = {
  ENV: "DEV",
  DB_USER: "user",
  DB_PASSWORD: "super-secret-password",
  DB_NAME: "db",
  DB_HOST: "127.0.0.1",
  DB_PORT: "5432",
  AWS_REGION: "eu-north-1",
  API_JWT_SECRET: "super-secret-jwt",
};

const validProd: NodeJS.ProcessEnv = {
  ...validDev,
  ENV: "PROD",
  BASE_URL: "https://envault.me",
  AWS_ACCESS_KEY_ID: "key-id",
  AWS_SECRET_ACCESS_KEY: "aws-secret",
};

describe("Runtime config validation", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("getRuntimeConfigErrors", () => {
    it("should accept valid DEV config without BASE_URL and AWS", () => {
      expect(getRuntimeConfigErrors("api", validDev)).to.deep.equal([]);
    });

    it("should accept valid PROD config", () => {
      expect(getRuntimeConfigErrors("api", validProd)).to.deep.equal([]);
      expect(getRuntimeConfigErrors("worker", validProd)).to.deep.equal([]);
    });

    it("should report every missing common variable", () => {
      const errors = getRuntimeConfigErrors("worker", {});
      for (const name of ["ENV", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_HOST", "DB_PORT", "AWS_REGION"]) {
        expect(errors).to.include(`${name} is required`);
      }
    });

    it("should treat blank values as missing", () => {
      const errors = getRuntimeConfigErrors("api", { ...validDev, DB_HOST: "   " });
      expect(errors).to.deep.equal(["DB_HOST is required"]);
    });

    it("should require AWS_REGION in any environment", () => {
      const errors = getRuntimeConfigErrors("worker", { ...validDev, AWS_REGION: undefined });
      expect(errors).to.deep.equal(["AWS_REGION is required"]);
    });

    it("should require API_JWT_SECRET for api only", () => {
      const env = { ...validDev, API_JWT_SECRET: "" };
      expect(getRuntimeConfigErrors("api", env)).to.deep.equal(["API_JWT_SECRET is required"]);
      expect(getRuntimeConfigErrors("worker", env)).to.deep.equal([]);
    });

    it("should reject non-numeric DB_PORT", () => {
      const errors = getRuntimeConfigErrors("api", { ...validDev, DB_PORT: "54x2" });
      expect(errors).to.deep.equal(["DB_PORT must be a number"]);
    });

    it("should require BASE_URL in PROD", () => {
      const errors = getRuntimeConfigErrors("api", { ...validProd, BASE_URL: undefined });
      expect(errors).to.deep.equal(["BASE_URL is required when ENV=PROD"]);
    });

    it("should require https BASE_URL in PROD", () => {
      const errors = getRuntimeConfigErrors("api", { ...validProd, BASE_URL: "http://envault.me" });
      expect(errors).to.deep.equal(["BASE_URL must use https:// when ENV=PROD"]);
    });

    it("should allow http BASE_URL outside PROD but reject invalid URL", () => {
      expect(getRuntimeConfigErrors("api", { ...validDev, BASE_URL: "http://localhost:5173" })).to.deep.equal([]);
      expect(getRuntimeConfigErrors("api", { ...validDev, BASE_URL: "not a url" }))
        .to.deep.equal(["BASE_URL must be a valid URL"]);
    });

    it("should require AWS credentials in PROD only", () => {
      const env = { ...validProd, AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" };
      expect(getRuntimeConfigErrors("api", env)).to.deep.equal([
        "AWS_ACCESS_KEY_ID is required when ENV=PROD",
        "AWS_SECRET_ACCESS_KEY is required when ENV=PROD",
      ]);
      expect(getRuntimeConfigErrors("api", { ...env, ENV: "DEV" })).to.deep.equal([]);
    });

    it("should never include secret values in errors", () => {
      const errors = getRuntimeConfigErrors("api", {
        ...validProd,
        DB_PORT: "bad-port-secret",
        BASE_URL: "http://user:url-secret@envault.me",
        DB_HOST: "",
      }).join("\n");
      const secrets = ["super-secret-password", "super-secret-jwt", "aws-secret", "bad-port-secret", "url-secret"];
      for (const secret of secrets) {
        expect(errors).to.not.include(secret);
      }
    });
  });

  describe("validateRuntimeConfigOrExit", () => {
    it("should exit with code 1 and print names only when config is invalid", () => {
      const exitStub = sinon.stub(process, "exit");
      const errorStub = sinon.stub(console, "error");
      const saved = { ...process.env };
      try {
        for (const name of Object.keys(validDev)) {
          delete process.env[name];
        }
        validateRuntimeConfigOrExit("api");
      } finally {
        Object.assign(process.env, saved);
      }
      expect(exitStub.calledOnceWith(1)).to.be.true;
      expect(errorStub.firstCall.args[0]).to.include("DB_HOST is required");
    });

    it("should not exit when config is valid", () => {
      const exitStub = sinon.stub(process, "exit");
      const saved = { ...process.env };
      try {
        Object.assign(process.env, validDev);
        validateRuntimeConfigOrExit("api");
      } finally {
        Object.assign(process.env, saved);
      }
      expect(exitStub.called).to.be.false;
    });
  });
});

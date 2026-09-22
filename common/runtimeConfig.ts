export type RuntimeService = "api" | "worker";

const PROD = "PROD";
const COMMON_REQUIRED = ["ENV", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_HOST", "DB_PORT", "AWS_REGION"];
const API_REQUIRED = ["API_JWT_SECRET"];
const MAIL_REQUIRED_IN_PROD = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];

/**
 * Checks whether a string is a valid absolute URL
 * @param value String to check
 * @returns `true` if the value can be parsed as a URL
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates runtime settings required by a service. Error messages contain only variable names,
 * never their values, so the result is safe to log.
 * @param service Service which is starting
 * @param env Environment variables to check, `process.env` by default
 * @returns List of problems, empty if the configuration is valid
 */
export function getRuntimeConfigErrors(
  service: RuntimeService,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const errors: string[] = [];
  const isProd = env.ENV === PROD;

  const required = [
    ...COMMON_REQUIRED,
    ...(service === "api" ? API_REQUIRED : []),
    ...(isProd ? MAIL_REQUIRED_IN_PROD : []),
  ];
  for (const name of required) {
    if (!env[name]?.trim()) {
      errors.push(`${name} is required${MAIL_REQUIRED_IN_PROD.includes(name) ? " when ENV=PROD" : ""}`);
    }
  }

  if (env.DB_PORT?.trim() && !/^\d+$/.test(env.DB_PORT.trim())) {
    errors.push("DB_PORT must be a number");
  }

  const baseUrl = env.BASE_URL?.trim();
  if (isProd && !baseUrl) {
    errors.push("BASE_URL is required when ENV=PROD");
  } else if (baseUrl && !isValidUrl(baseUrl)) {
    errors.push("BASE_URL must be a valid URL");
  } else if (isProd && baseUrl && !baseUrl.startsWith("https://")) {
    errors.push("BASE_URL must use https:// when ENV=PROD");
  }

  return errors;
}

/**
 * Validates runtime settings at process start. On problems prints them (names only, no secrets)
 * and terminates the process with exit code 1.
 * @param service Service which is starting
 * @returns Nothing
 */
export function validateRuntimeConfigOrExit(service: RuntimeService): void {
  const errors = getRuntimeConfigErrors(service);
  if (errors.length > 0) {
    console.error(`Invalid ${service} configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
}

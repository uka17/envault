# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General coding rules

- Follow the rules in [`CODING_RULES.MD`](../CODING_RULES.MD) in every task. They apply to all agents and subagents. If a rule there conflicts with a project-specific rule below, surface the conflict instead of silently picking one.
- If this repository is opened as part of the `envault.me` root workspace (both `envault/` and `envault_fe/` present as siblings), the root `CLAUDE.md` there is the source of truth instead of this file.

## Code style

- Add JSDoc comments in English for all methods and functions (including class methods and exported functions) except arrow functions and tests. Include `@param` for each parameter and `@returns` for the return value.
- Always write or update tests when adding or changing methods.
- ESLint (`eslint.config.mjs`) enforces: 2-space indent, double quotes, semicolons, trailing commas in multiline, no space before function parens, 1tbs braces, 120-char lines. Run `npm run lint` before considering work done.

## Commands

This is an ESM TypeScript project. `npm run build` compiles `api/`, `worker/`, `common/`, `model/`, `service/`, `di/` into `dist/`, and all runtime/test commands run against `dist/`, not the `.ts` sources directly.

```bash
# Build (required before running tests, the app, or swagger regen)
npm run build

# Lint
npm run lint

# Run tests (build + mocha), split by process
npm run mtest:api      # api/test/**/*.test.ts
npm run mtest:worker   # worker/test/**/*.test.ts

# Run a single test file (after building once)
npm run build && mocha --file dist/api/test/setup.js dist/api/test/route.stash.test.js
npm run build && mocha --file dist/worker/test/setup.js dist/worker/test/link-service.stash.test.js

# Coverage (writes html/lcov under api/coverage or worker/coverage)
npm run test:api
npm run test:worker

# Run the app locally (uses nodemon + .env)
npm run api       # api/index.ts, nodemon.api.json
npm run worker     # worker/index.ts, nodemon.worker.json

# Regenerate Swagger/OpenAPI from route annotations
npm run swagger
```

Notes:
- `mtest:*` and `test:*` both run `npm run build` first; there's no watch-mode test runner, so re-run after every edit.
- `api` and `worker` are independent processes with separate nodemon configs, tests, and coverage (`c8 --exclude=worker` / `--exclude=api`). Don't touch one part's tests/build when only the other changed.
- Local dev requires a `.env` file (see variable names in `NOTES.MD` / the checked-in `.env` template) and a Postgres database; `TEST_DB_*` vars point at a separate database used by `api/test/setup.ts` and `worker/test/setup.ts`.
- `DEV_EMAIL_RECIPIENT` redirects all outgoing mail outside of `ENV=PROD` so local/test runs never deliver to real users; test setup additionally stubs the SES transporter as a safety net (`api/test/setup.ts`).
- `validateRuntimeConfigOrExit` (`common/runtimeConfig.ts`) checks required env vars at process start for both `api` and `worker`, and exits with a message containing only variable names, never values.

## Architecture

Two independent Node.js entry points share the same domain layer through path-alias imports:

- **`api/`** — Express HTTP server (`api/index.ts`). Routes register controllers/validators resolved from DI, not instantiated directly: `api/src/route/*.ts` -> `api/src/controller/*.ts` (+ `api/src/route/validator/*.ts`).
- **`worker/`** — background process (`worker/index.ts`) with no HTTP surface. It initializes the same DI container and DB connection, then runs `StashSenderService.processDueStashes()` on a catch-up call followed by a `setInterval` loop (`config.runInterval`). A tick's errors are logged, never thrown, so one bad tick can't crash the process.

Shared domain code lives outside both process folders and is imported via subpath aliases from `package.json` (`imports` field), which resolve to compiled output in `dist/`:

```
#service/*  -> dist/service/*   (business logic, e.g. StashService, UserService, EmailService)
#common/*   -> dist/common/*    (DB, error codes, runtime config, templates)
#model/*    -> dist/model/*     (TypeORM entities)
#di/*       -> dist/di/*        (container.ts, tokens.ts)
```

Because aliases point at `dist/`, a source-only edit is invisible to anything importing through `#service/*` etc. until `npm run build` runs.

**Dependency injection (`tsyringe`).** `di/container.ts#initDI(appDataSource, loggerOptions)` is the single place that wires everything: TypeORM repositories are `registerInstance`'d directly from `appDataSource.getRepository(...)`, services/controllers/validators are `registerSingleton`'d. Both `api/index.ts` and `worker/index.ts` call `initDI` after initializing their own `DataSource`, then `container.resolve<T>(TOKENS.X)` where needed. `di/tokens.ts` is the single symbol registry; every new injectable needs a token there plus a registration in `initDI`. Controllers/services use `@injectable()` + constructor `@inject(TOKENS.X)`.

**Route/controller/validator pattern.** Each resource has three files under `api/src/route/`, `api/src/controller/`, `api/src/route/validator/`. Route functions take an `express.Router`, resolve their controller/validator from the container, and attach middleware chains (`passport.authenticate`, validator rule sets, `validateRequest` from `api/src/route/validator/common.ts`) before the bound controller method. Route files also carry inline `#swagger.*` comment annotations consumed by `swagger-autogen` (`npm run swagger`); keep these in sync with behavior changes, per `.claude/commands/update-swagger.md`.

**Errors.** Controllers catch and `next(e)` to a global error handler (`api/src/route/error.ts`). Throw `ApiError.fromCode(statusCode, code, errors?)` (`api/src/error/ApiError.ts`) using a code from `common/errorCodes.ts`'s `API_ERROR_MESSAGES` map; that module is the single source of truth for stable, machine-readable error codes, English fallback messages, and status semantics that the frontend maps to localized text. Add new failure modes there rather than inline strings.

**Models.** TypeORM entities in `model/` extend `model/Base.ts`'s abstract `BaseEntity` (`id`, `createdOn`/`modifiedOn` timestamps, `createdBy`/`modifiedBy` — the latter two `@Exclude()`d from serialization via `class-transformer`). `common/dataSource.ts#getAppDataSource` registers all entities and uses `SnakeNamingStrategy` (`common/SnakeNamingStrategy.ts`) for snake_case columns/tables; `synchronize: true` means schema changes take effect on next connect without manual migrations, though a `common/migrations` directory exists.

**Config.** `api/src/config/config.ts` and `worker/src/config/config.ts` each build a typed config object from `process.env` (loaded via `dotenv/config`) for their own process; there's no shared config module, so an env var used by both processes is read independently in each.

**Email.** `service/EmailService.ts` sends via AWS SES (`@aws-sdk/client-ses`) using MJML-rendered templates in `common/templates/*.ts` (password reset, email verification, email change confirmation) and `worker/src/templates/stashReady.ts`. Outside `ENV=PROD`, mail is redirected to `DEV_EMAIL_RECIPIENT` when set.

**Core domain flow (stashes).** A `Stash` is an encrypted message a user schedules for future delivery: the body is opaque ciphertext the server never decrypts. `StashService` (api-side CRUD, ownership/row-lock checks) and `StashSenderService` (worker-side, `processDueStashes`) are separate services sharing the same `Stash`/`SendLog` entities. Mutating an in-flight stash (delete/snooze) is guarded by a PostgreSQL row lock and returns `stash_delivery_in_progress` (409) on conflict; sent stashes return `stash_already_sent` where relevant. See `docs/password-reset.md` and `docs/email-change.md` for the auth-adjacent flows (password recovery with durable per-request rate limits, and timing-attack-resistant response handling; email change with verification tokens).

## Documentation to keep in sync

- `api/src/swagger` (generate with `npm run swagger`, see `.claude/commands/update-swagger.md`) whenever routes/request/response shapes change.
- `api/bruno/` manual API-testing collection when endpoints are added or changed.
- `docs/*.md` for the specific flows they document (password reset, email change) when their business rules change.

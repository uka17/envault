# Update Swagger

Update swagger annotations in route files to match the current state of the codebase.

## What to do

1. Read all route files in `api/src/route/` (skip `validator/` subfolder and `error.ts`)
2. For each route, read the corresponding controller method in `api/src/controller/` to understand what it does
3. Read models in `model/` to understand request/response shapes
4. Read validators in `api/src/route/validator/` to understand required fields and validation rules
5. Update `#swagger.*` annotations inline in each route file so they accurately describe:
   - `summary` — short one-line description
   - `tags` — group name matching the resource (User, Stash, Health)
   - `description` — what the endpoint does, including side effects
   - `parameters` — body params using swagger-autogen shorthand (`$field` for required), path params with type/description
   - `responses` — all possible HTTP status codes with description and schema (`$ref` to definitions when possible)
   - `security` — add `[{ "bearerAuth": [] }]` for endpoints protected by `passport.authenticate("jwt")`
6. Update `definitions` in `api/src/swagger/swagger.ts` using swagger-autogen shorthand (`$field: exampleValue` for required fields, `field: exampleValue` for optional). **Do not use raw JSON Schema syntax** — swagger-autogen will interpret `type`, `properties`, `required` keys literally as object fields.
7. Run `npm run swagger` to regenerate `dist/api/src/swagger/swagger.json`
8. Run `cp dist/api/src/swagger/swagger.json api/src/swagger/swagger.json`
9. Stage the updated files: `git add api/src/route/*.ts api/src/swagger/swagger.ts api/src/swagger/swagger.json`

## Key rules

- Annotations live **only in route files**, never in controllers
- swagger-autogen definitions syntax: `{ $requiredField: "example", optionalField: "example" }` — the `$` prefix marks required
- For inline response schemas that are not in definitions, also use shorthand: `{ affected: 1 }` not `{ type: 'object', properties: { affected: { type: 'integer' } } }`
- `$ref` in parameters/responses pointing to definitions works correctly and should be used for complex types
- Endpoints using `passport.authenticate("jwt", { session: false })` require `/* #swagger.security = [{ "bearerAuth": [] }] */`

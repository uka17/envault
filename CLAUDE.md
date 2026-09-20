# Claude Instructions

## General coding rules

- Follow the rules in [`CODING_RULES.MD`](../CODING_RULES.MD) in every task. They apply to all agents and subagents. If a rule there conflicts with a project-specific rule below, surface the conflict instead of silently picking one.

## Code Style

- Always add JSDoc comments for all methods and functions (including arrow functions, class methods, and exported functions). Include `@param` for each parameter and `@returns` for the return value.
- Always write tests when writing new methods.

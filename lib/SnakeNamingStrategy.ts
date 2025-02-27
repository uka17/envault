//This class is used by TypeORM config to convert the camelCase column and table names to snake_case

import { DefaultNamingStrategy, NamingStrategyInterface } from "typeorm";
import { snakeCase } from "typeorm/util/StringUtils";

export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(targetName: string, userSpecifiedName?: string): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  columnName(
    propertyName: string,
    customName?: string,
    embeddedPrefixes?: string[]
  ): string {
    return snakeCase(
      embeddedPrefixes?.join("_") + (customName ?? propertyName)
    );
  }
}

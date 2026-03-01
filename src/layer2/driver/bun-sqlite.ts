import { createBunSqliteConnection } from "../adapter/bun-sqlite";
import { SqliteL2Driver } from "../sqlite-driver";

export class BunSqliteDriver extends SqliteL2Driver {
  constructor(path: string) {
    super(createBunSqliteConnection(path));
  }
}

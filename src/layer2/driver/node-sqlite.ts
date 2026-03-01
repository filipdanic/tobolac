import { createNodeSqliteConnection } from "../adapter/node-sqlite";
import { SqliteL2Driver } from "../sqlite-driver";

export class NodeSqliteDriver extends SqliteL2Driver {
  constructor(path: string) {
    super(createNodeSqliteConnection(path));
  }
}

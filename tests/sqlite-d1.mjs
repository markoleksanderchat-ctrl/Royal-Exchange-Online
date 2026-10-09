import { DatabaseSync } from "node:sqlite";
export class SqliteD1 {
  constructor(at = new Date("2026-10-09T13:00:00Z")) {
    this.sqlite = new DatabaseSync(":memory:"); this.now = at.getTime(); this.queries = [];
    this.sqlite.function("unixepoch", { varargs: true }, () => Math.floor(this.now / 1000));
  }
  prepare(sql) {
    const statement = { sql, values: [], bind(...values) { this.values = values; return this; } };
    statement.all = async () => { this.queries.push(sql); return { results: this.sqlite.prepare(sql).all(...statement.values), success: true }; };
    statement.first = async () => (await statement.all()).results[0] ?? null;
    statement.run = async () => { this.queries.push(sql); return { meta: this.sqlite.prepare(sql).run(...statement.values), success: true }; };
    return statement;
  }
  async batch(statements) {
    this.beforeBatch?.(statements);
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map(statement => {
        this.queries.push(statement.sql); const prepared = this.sqlite.prepare(statement.sql);
        return prepared.columns().length ? { results: prepared.all(...statement.values) }
          : { results: [], meta: prepared.run(...statement.values) };
      });
      this.sqlite.exec("COMMIT"); return results;
    } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
  }
}

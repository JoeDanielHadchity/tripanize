import { ColumnTypeEnum, DriverAdapterError, type ArgType, type IsolationLevel, type SqlDriverAdapter, type SqlDriverAdapterFactory, type SqlQuery, type SqlResultSet, type Transaction } from "@prisma/driver-adapter-utils";

export interface SqlStorageHost {
  sql: Pick<SqlStorage, "exec">;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}
function argument(value: unknown, type: ArgType): SqlStorageValue {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (type.scalarType === "datetime") return new Date(value as string).toISOString().replace("Z", "+00:00");
  if (["int", "bigint", "float", "decimal"].includes(type.scalarType)) return Number(value);
  if (value instanceof Uint8Array) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  if (typeof value === "string" && type.scalarType === "bytes") return Uint8Array.from(Buffer.from(value, "base64")).buffer;
  return value as SqlStorageValue;
}
function databaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNIQUE constraint failed/i.test(message)) {
    const columns = message.split(/constraint failed:\s*/i)[1]?.split(/,\s*/).map((v) => v.split(":")[0]);
    throw new DriverAdapterError({ kind: "UniqueConstraintViolation", constraint: { fields: columns?.map((v) => v.split(".").pop()!) ?? [] } });
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) throw new DriverAdapterError({ kind: "ForeignKeyConstraintViolation", constraint: { foreignKey: {} } });
  if (/NOT NULL constraint failed/i.test(message)) throw new DriverAdapterError({ kind: "NullConstraintViolation" });
  throw new DriverAdapterError({ kind: "sqlite", extendedCode: 1, message });
}
class DurableSqliteDriver implements SqlDriverAdapter {
  readonly provider = "sqlite" as const;
  readonly adapterName = "tripanize/durable-sqlite";
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly storage: SqlStorageHost) {}
  // Durable Object SQLite accepts at most 100 bound parameters per statement.
  // Tell Prisma to batch relation lookups and bulk writes at the actual limit.
  getConnectionInfo() { return { maxBindValues: 100, supportsRelationJoins: false }; }
  private async lock() {
    const previous = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  private query(query: SqlQuery): SqlResultSet {
    try {
      const cursor = this.storage.sql.exec(query.sql, ...query.args.map((v, i) => argument(v, query.argTypes[i])));
      const columnNames = [...cursor.columnNames];
      const rows = [...cursor.raw()].map((row) => row.map((v) => v instanceof ArrayBuffer ? new Uint8Array(v) : v));
      const columnTypes = columnNames.map((_, i) => {
        const value = rows.find((row) => row[i] !== null)?.[i];
        if (typeof value === "string") return ColumnTypeEnum.Text;
        if (typeof value === "number") return Number.isInteger(value) ? ColumnTypeEnum.Int64 : ColumnTypeEnum.Double;
        if (value instanceof Uint8Array) return ColumnTypeEnum.Bytes;
        return ColumnTypeEnum.Int32;
      });
      return { columnNames, columnTypes, rows };
    } catch (error) { return databaseError(error); }
  }
  private execute(query: SqlQuery): number {
    try {
      const cursor = this.storage.sql.exec(query.sql, ...query.args.map((v, i) => argument(v, query.argTypes[i])));
      [...cursor];
      // Billing rows can include index maintenance. Prisma needs SQLite's exact
      // affected-row count for optimistic locks and atomic job claims.
      return Number(this.storage.sql.exec("SELECT changes() AS count").one().count);
    } catch (error) { return databaseError(error); }
  }
  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const release = await this.lock();
    try { return this.query(query); } finally { release(); }
  }
  async executeRaw(query: SqlQuery): Promise<number> {
    const release = await this.lock();
    try { return this.execute(query); } finally { release(); }
  }
  async executeScript(script: string) {
    const release = await this.lock();
    try { this.storage.sql.exec(script); } finally { release(); }
  }
  async dispose() {}
  async startTransaction(level?: IsolationLevel): Promise<Transaction> {
    if (level && level !== "SERIALIZABLE") throw new DriverAdapterError({ kind: "InvalidIsolationLevel", level });
    // Prisma can request implicit transactions concurrently when it batches
    // large relation queries. Keep those groups isolated on this connection.
    const release = await this.lock();
    let ready!: () => void;
    let finish!: (commit: boolean) => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const decision = new Promise<boolean>((resolve) => { finish = resolve; });
    const rolledBack = new Error("Transaction rollback");
    const transaction = this.storage.transaction(async () => { ready(); if (!await decision) throw rolledBack; });
    const completed = transaction.then(() => undefined, (error) => { if (error !== rolledBack) throw error; });
    void completed.catch(() => undefined);
    try { await Promise.race([started, completed]); }
    catch (error) { release(); throw error; }
    const close = async (commit: boolean) => { finish(commit); try { await completed; } finally { release(); } };
    return {
      provider: this.provider, adapterName: this.adapterName, options: { usePhantomQuery: true },
      queryRaw: async query => this.query(query), executeRaw: async query => this.execute(query),
      commit: () => close(true), rollback: () => close(false),
    };
  }
}
export class DurableSqliteAdapter implements SqlDriverAdapterFactory {
  readonly provider = "sqlite" as const;
  readonly adapterName = "tripanize/durable-sqlite";
  constructor(private readonly storage: SqlStorageHost) {}
  async connect() { return new DurableSqliteDriver(this.storage); }
}

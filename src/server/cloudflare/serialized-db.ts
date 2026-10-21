import type { AppDatabase } from "@/server/db";

export type Serialize = <T>(run: () => Promise<T>) => Promise<T>;

/** Background tasks release the application queue while awaiting external APIs.
 * Each complete database operation, including an interactive transaction, still
 * shares the same lock as HTTP requests so unrelated writes cannot join it.
 */
export function serializedDatabase(database: AppDatabase, serialize: Serialize): AppDatabase {
  const models = new Map<PropertyKey, object>();
  return new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value === "function") return (...args: unknown[]) => serialize(async () => Reflect.apply(value, target, args));
      if (!value || typeof value !== "object") return value;
      if (!models.has(property)) models.set(property, new Proxy(value, {
        get(model, operation) {
          const method = Reflect.get(model, operation);
          return typeof method === "function" ? (...args: unknown[]) => serialize(async () => Reflect.apply(method, model, args)) : method;
        },
      }));
      return models.get(property);
    },
  });
}

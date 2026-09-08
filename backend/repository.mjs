import { FileRepository } from "./repositories/file.mjs";
import { PostgresRepository } from "./repositories/postgres.mjs";

export function createRepository(config = {}, env = process.env) {
  const driver = config.storageDriver || env.STORAGE_DRIVER || (env.DATABASE_URL ? "postgres" : "file");
  if (driver === "postgres") {
    return new PostgresRepository({ connectionString: config.databaseUrl || env.DATABASE_URL });
  }
  if (driver === "file") {
    return new FileRepository({ file: config.file });
  }
  throw Object.assign(new Error(`unsupported storage driver: ${driver}`), { code: "invalid-storage-driver" });
}

let defaultRepository;

export function getRepository() {
  if (!defaultRepository) defaultRepository = createRepository();
  return defaultRepository;
}

export function setRepositoryForTests(repository) {
  defaultRepository = repository;
}

import { statSync } from "node:fs";
import path from "node:path";

// Only the pinned Next plugin's explicit directory lookup is supported.
export function globSync(directory, options) {
  if (typeof directory !== "string" || !directory || !options || options.onlyDirectories !== true
    || Reflect.ownKeys(options).length !== 1) {
    throw new TypeError("Unsupported Next root-directory lookup; use explicit project directories");
  }
  const absolute = path.resolve(directory);
  let stats;
  try {
    stats = statSync(absolute);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    throw new Error("Next root directory must exist; glob patterns are unsupported. Use an explicit directory or array.", { cause: error });
  }
  if (!stats.isDirectory()) throw new Error("Next root must be an explicit directory");
  return [absolute.replaceAll(path.sep, "/")];
}

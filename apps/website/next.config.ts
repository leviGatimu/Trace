import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  /*
    npm hoists `next` to the repository root, so Turbopack must start there. Left
    to itself it walks up to the lockfile in the home directory instead, which
    would pull the whole profile into the workspace.
  */
  turbopack: { root: repositoryRoot },
};

export default nextConfig;

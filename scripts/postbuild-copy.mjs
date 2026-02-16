import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function resolveStandaloneServerPath() {
  const standaloneRoot = ".next/standalone";
  const rootServerPath = join(standaloneRoot, "server.js");

  if (existsSync(rootServerPath)) {
    return rootServerPath;
  }

  const requiredFilesPath = ".next/required-server-files.json";
  if (!existsSync(requiredFilesPath)) {
    return rootServerPath;
  }

  try {
    const requiredFiles = JSON.parse(readFileSync(requiredFilesPath, "utf8"));
    const relativeAppDir = requiredFiles?.relativeAppDir;

    if (typeof relativeAppDir === "string" && relativeAppDir.length > 0) {
      const segments = relativeAppDir.split(/[/\\]+/).filter(Boolean);
      return join(standaloneRoot, ...segments, "server.js");
    }
  } catch {
    return rootServerPath;
  }

  return rootServerPath;
}

const standaloneServerPath = resolveStandaloneServerPath();

if (!existsSync(standaloneServerPath)) {
  console.error(`Standalone-сервер не найден после сборки: ${standaloneServerPath}`);
  process.exit(1);
}

const standaloneAppDir = dirname(standaloneServerPath);
const standaloneNextDir = join(standaloneAppDir, ".next");

mkdirSync(standaloneNextDir, { recursive: true });

if (existsSync(".next/static")) {
  cpSync(".next/static", join(standaloneNextDir, "static"), {
    recursive: true,
    force: true,
  });
}

if (existsSync("public")) {
  cpSync("public", join(standaloneAppDir, "public"), {
    recursive: true,
    force: true,
  });
}

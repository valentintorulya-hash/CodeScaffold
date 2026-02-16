import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
      const nestedServerPath = join(standaloneRoot, ...segments, "server.js");
      if (existsSync(nestedServerPath)) {
        return nestedServerPath;
      }
    }
  } catch {
    return rootServerPath;
  }

  return rootServerPath;
}

const serverPath = resolveStandaloneServerPath();

if (!existsSync(serverPath)) {
  console.error(`Не найден standalone-сервер: ${serverPath}`);
  console.error("Перед `bun start` выполните `bun run build`.");
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "production",
  },
});

child.on("error", (error) => {
  console.error(`Не удалось запустить standalone-сервер: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

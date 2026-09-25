import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import { readDatabaseUrl } from "../src/config/database-env";
import * as schema from "../src/infrastructure/database/schema";
import { BootstrapInstallation } from "../src/modules/identity/application/bootstrap-installation";
import { BootstrapAlreadyInitializedError } from "../src/modules/identity/domain/access-errors";
import {
  BetterAuthLocalIdentityProvisioner,
  createBootstrapAuth,
} from "../src/modules/identity/infrastructure/bootstrap-auth";
import { DrizzleBootstrapCoordinator } from "../src/modules/identity/infrastructure/bootstrap-coordinator";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function readBootstrapInput() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error("Bootstrap requires an interactive terminal.");

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const userName = await prompt.question("Responsible name: ");
    const userEmail = await prompt.question("Responsible email: ");
    const laboratoryAnswer = await prompt.question(
      "Laboratory name [Laboratorio de Pesados]: ",
    );
    const laboratoryName = laboratoryAnswer.trim() || "Laboratorio de Pesados";
    const defaultSlug = slugify(laboratoryName);
    const slugAnswer = await prompt.question(
      `Laboratory slug [${defaultSlug}]: `,
    );

    const mutablePrompt = prompt as typeof prompt & {
      _writeToOutput: (value: string) => void;
    };
    const writeToOutput = mutablePrompt._writeToOutput.bind(prompt);
    mutablePrompt._writeToOutput = () => undefined;

    stdout.write("Password: ");
    const password = await prompt.question("");
    stdout.write("\nConfirm password: ");
    const confirmation = await prompt.question("");
    stdout.write("\n");
    mutablePrompt._writeToOutput = writeToOutput;

    if (password !== confirmation)
      throw new Error("Password confirmation does not match.");

    return {
      userName,
      userEmail,
      password,
      laboratoryName,
      laboratorySlug: slugAnswer.trim() || defaultSlug,
    };
  } finally {
    prompt.close();
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const pool = new Pool({
    connectionString: readDatabaseUrl(process.env),
    max: 4,
    connectionTimeoutMillis: 5_000,
  });
  const database = drizzle(pool, { schema });

  try {
    const bootstrapAuth = createBootstrapAuth(database);
    const bootstrap = new BootstrapInstallation(
      new BetterAuthLocalIdentityProvisioner(bootstrapAuth),
      new DrizzleBootstrapCoordinator(database),
    );
    const result = await bootstrap.execute(await readBootstrapInput());

    stdout.write(
      `Bootstrap completed. User ${result.userId} now belongs to laboratory ${result.laboratoryId}.\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof BootstrapAlreadyInitializedError) {
    console.error(
      "Bootstrap stopped: the installation already contains identity data.",
    );
  } else {
    console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  }
  process.exitCode = 1;
});

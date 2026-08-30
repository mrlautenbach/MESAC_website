import EmbeddedPostgres from "embedded-postgres";
import { existsSync, readdirSync } from "fs";

const databaseDir = "/Users/matthewlautenbach/MESAC_Website/.pgdata-devtest";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
});

const alreadyInitialised = existsSync(databaseDir) && readdirSync(databaseDir).length > 0;
if (!alreadyInitialised) {
  await pg.initialise();
}
await pg.start();
console.log("Embedded Postgres started on port 5433");

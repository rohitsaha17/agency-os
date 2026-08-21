/**
 * Print the SQL that sets one account's password. Applies nothing.
 *
 * The app has no forgot-password flow, so a locked-out owner has to reset
 * theirs in the database. This exists so that can happen without the password
 * ever leaving the machine it was typed on: it reads from stdin, hashes with
 * the app's own scrypt helper, and prints an UPDATE for you to run yourself.
 *
 *   npx tsx scripts/make-password-reset.ts vibrnd2@gmail.com
 *
 * It will prompt for the password (hidden), then print SQL. Nothing is
 * written, nothing is logged, and the password is not echoed or stored.
 */
import { createInterface } from "node:readline";
import { hashPassword, validatePassword } from "../lib/password";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: npx tsx scripts/make-password-reset.ts <email>");
  process.exit(1);
}

/** Read a line without echoing it, so it never appears on screen or in scrollback. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const stdout = process.stdout as NodeJS.WriteStream & { write: (s: string) => boolean };
    const original = stdout.write.bind(stdout);
    let muted = false;
    stdout.write = ((chunk: string, ...rest: unknown[]) => {
      if (muted && typeof chunk === "string" && !chunk.includes("\n")) return true;
      return (original as (c: string, ...r: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof stdout.write;

    rl.question(prompt, (answer) => {
      stdout.write = original;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const password = (await askHidden(`New password for ${email}: `)).trim();

  const problem = validatePassword(password);
  if (problem) {
    console.error(`\n${problem}`);
    process.exit(1);
  }

  // The same function the app uses, so the stored format matches exactly.
  const hash = hashPassword(password);

  // Single-quotes doubled, the only escaping a scrypt hash or an email could
  // need — both are otherwise plain ASCII.
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

  console.log(`
-- Reset the password for ${email}.
-- Generated locally; the password itself was never written down or sent.
-- The hash is scrypt$salt$key, the format lib/password.ts reads.
--
-- Check it matched exactly one row before you commit:

BEGIN;

UPDATE users
   SET "passwordHash" = ${q(hash)}
 WHERE lower(email) = lower(${q(email)});

-- Expect: UPDATE 1
-- If it says UPDATE 0 the email is wrong; ROLLBACK and check.
-- If it says more than 1, something is very wrong; ROLLBACK.

COMMIT;
`);

  console.error("Copy the SQL above and run it against production. Nothing was applied.");
}

main();

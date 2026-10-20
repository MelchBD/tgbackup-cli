// Getting the password without ever putting it on the command line (where it would stay in shell history).
import { readFileSync } from "node:fs";
import { UserError } from "./file.mjs";

/** Reads one line from the terminal without showing what is typed. */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (fn, arg) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      fn(arg);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(resolve, value);
        if (ch === "\u0003") return done(reject, new UserError("Cancelled."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/**
 * The password, in this order: a file you name with --password-file, the TGBACKUP_PASSWORD variable, then a hidden prompt.
 * There is deliberately no --password option: anything typed on the command line is saved in your shell history.
 */
export async function getPassword({ passwordFile } = {}, env = process.env) {
  if (passwordFile) {
    try {
      return readFileSync(passwordFile, "utf8").replace(/\r?\n$/, "");
    } catch {
      throw new UserError(`Can't read the password file ${passwordFile}.`);
    }
  }
  if (env.TGBACKUP_PASSWORD) return env.TGBACKUP_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new UserError("No password given. Run this in a terminal to be asked for it, or set TGBACKUP_PASSWORD, or use --password-file FILE.");
  }
  return askHidden("Password for the file: ");
}

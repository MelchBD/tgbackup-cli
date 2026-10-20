// Opening a TG Backup file: unlock it with the password (age passphrase format), then check it is a TG Backup document we can read.
// Format: https://www.tgbackup.xyz/export-format  (version 1). Nothing here touches the network.
import { Decrypter } from "age-encryption";

export const SUPPORTED_VERSION = 1;

export class UserError extends Error {}

/** The plain JSON text inside a locked file. Throws UserError with a plain-words message when the password is wrong. */
export async function unlock(bytes, password) {
  const head = new TextDecoder().decode(bytes.slice(0, 21));
  if (head !== "age-encryption.org/v1") {
    throw new UserError("This is not a locked TG Backup file (it doesn't start like an age file). Did you pick the right file?");
  }
  const d = new Decrypter();
  d.addPassphrase(password);
  try {
    return new TextDecoder().decode(await d.decrypt(bytes));
  } catch {
    throw new UserError("Wrong password, or the file is damaged. Nothing was opened.");
  }
}

/** Parses and checks the document. Unknown extra keys are fine (readers ignore them); a different version number is not. */
export function parseDocument(json) {
  let doc;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new UserError("The file opened, but what is inside is not a TG Backup document.");
  }
  if (!doc || doc.format !== "tgbackup-export") throw new UserError("The file opened, but it is not a TG Backup export.");
  if (doc.version !== SUPPORTED_VERSION) {
    throw new UserError(`This file is format version ${doc.version}; this tool reads version ${SUPPORTED_VERSION}. Get a newer tool from tgbackup.xyz/export-format.`);
  }
  for (const key of ["contacts", "chatOnly", "chats", "folders"]) {
    if (!Array.isArray(doc[key])) doc[key] = [];
  }
  doc.backup ??= { takenAt: null, account: {}, counts: {} };
  return doc;
}

export async function openFile(bytes, password) {
  return parseDocument(await unlock(bytes, password));
}

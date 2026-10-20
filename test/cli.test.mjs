// Offline tests for the tgbackup command. A locked file is built here the same way the website builds one (age passphrase format).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { Encrypter } from "age-encryption";
import { cell } from "../src/csv.mjs";
import { run } from "../src/cli.mjs";

const PASSWORD = "a long test password here";
const doc = {
  format: "tgbackup-export",
  version: 1,
  exportedAt: "2026-10-20T14:03:11.000Z",
  backup: { takenAt: "2026-10-19T09:12:44.000Z", account: { id: "1", username: "me", name: "Me Myself", bio: "builder" }, counts: {} },
  contacts: [
    { id: "10", firstName: "Ada", lastName: "Lovelace", username: "ada", bio: "Founder at Analytical Engines, crypto", lastContactAt: "2026-10-01T10:00:00Z", pinned: true, archived: null, muted: null },
    { id: "11", firstName: "Bob", lastName: null, username: null, bio: null, lastContactAt: "2026-10-10T10:00:00Z", pinned: false, archived: false, muted: false },
    { id: "12", firstName: "=HYPERLINK(\"http://evil\")", lastName: null, username: "evil", bio: "\u001b[2Jscreen wipe\u0007", lastContactAt: null, pinned: null, archived: null, muted: null },
  ],
  chatOnly: [{ id: "77", name: "Chat Only", username: "chatonly", lastContactAt: null, pinned: null, archived: null, muted: null }],
  chats: [
    { id: "-1001234567890", kind: "supergroup", title: "Private team", username: null, inviteLink: "https://t.me/+secret", rejoin: "needs_invite", memberCount: 40, lastActivityAt: "2026-10-05T00:00:00Z", pinned: null, archived: null, muted: null, isAdmin: true, admins: [{ id: "9", name: "Boss", username: "boss", isCreator: true }] },
    { id: "-1002", kind: "channel", title: "Public news", username: "publicnews", inviteLink: null, rejoin: "auto", memberCount: 12000, lastActivityAt: "2026-10-09T00:00:00Z", pinned: null, archived: null, muted: null, isAdmin: false, admins: [] },
  ],
  folders: [
    { id: 5, position: 0, title: "Work", emoticon: "💼", flags: { contacts: true }, include: [{ kind: "channel", id: "1234567890" }, { kind: "user", id: "10" }], exclude: [{ kind: "user", id: "11" }], pinned: [{ kind: "user", id: "10" }] },
  ],
};

let dir;
let file;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), "tgbackup-cli-"));
  file = join(dir, "tg-backup.json.age");
  const e = new Encrypter();
  e.setPassphrase(PASSWORD);
  e.setScryptWorkFactor(10); // fast for tests; real files use 17
  writeFileSync(file, await e.encrypt(new TextEncoder().encode(JSON.stringify(doc))));
});
after(() => rmSync(dir, { recursive: true, force: true }));

async function tg(args, env = { TGBACKUP_PASSWORD: PASSWORD }) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, { out: (s) => (stdout += s), err: (s) => (stderr += s) }, env);
  return { code, stdout, stderr };
}

test("info shows the account, dates and counts", async () => {
  const r = await tg(["info", file]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Me Myself \(@me\)/);
  assert.match(r.stdout, /Backup taken:\s+2026-10-19/);
  assert.match(r.stdout, /Contacts:\s+3 \(2 with a bio\)/);
  assert.match(r.stdout, /Groups\/channels:\s+2 \(1 need an invite, 1 have a saved invite link\)/);
});

test("contacts: most recent first, never-contacted last, search covers bios", async () => {
  const all = await tg(["contacts", file]);
  assert.ok(all.stdout.indexOf("Bob") < all.stdout.indexOf("Ada"), "Bob chatted more recently than Ada");
  assert.ok(all.stdout.indexOf("Ada") < all.stdout.indexOf("HYPERLINK"), "no date sorts last");
  const bio = await tg(["contacts", file, "--search", "analytical founder", "--bio"]);
  assert.match(bio.stdout, /Ada Lovelace/);
  assert.doesNotMatch(bio.stdout, /Bob/);
  assert.match(bio.stdout, /Founder at Analytical Engines/);
  assert.match((await tg(["contacts", file, "--search", "@ADA"])).stdout, /Ada Lovelace/, "case and a leading @ don't matter");
  assert.match((await tg(["contacts", file, "--search", "nobody-like-this"])).stdout, /No contacts match/);
});

test("--limit trims the list and says how many more there are", async () => {
  const r = await tg(["contacts", file, "--limit", "1"]);
  assert.match(r.stdout, /and 2 more/);
  assert.equal((await tg(["contacts", file, "--limit", "-3"])).code, 1);
});

test("chats and the needs-invite filter", async () => {
  const all = await tg(["chats", file]);
  assert.match(all.stdout, /Private team/);
  assert.match(all.stdout, /invite saved/);
  assert.match(all.stdout, /t\.me\/publicnews/);
  const need = await tg(["chats", file, "--needs-invite"]);
  assert.match(need.stdout, /Private team/);
  assert.doesNotMatch(need.stdout, /Public news/);
});

test("folders show names, not ids, and what is pinned or left out", async () => {
  const r = await tg(["folders", file]);
  assert.match(r.stdout, /💼 Work/);
  assert.match(r.stdout, /Private team/, "the channel id 1234567890 is found as -1001234567890");
  assert.match(r.stdout, /Ada Lovelace\s+\(pinned\)/);
  assert.match(r.stdout, /Left out: Bob/);
});

test("search looks in contacts, chats and other people", async () => {
  const r = await tg(["search", file, "chat"]);
  assert.match(r.stdout, /Other people you chatted with \(1\)/);
  const bio = await tg(["search", file, "crypto"]);
  assert.match(bio.stdout, /Contacts \(1\)/);
  assert.match(bio.stdout, /Ada Lovelace/);
});

test("csv defuses spreadsheet formulas and quotes everything", async () => {
  assert.equal(cell("=1+1"), "\"'=1+1\"");
  assert.equal(cell("say \"hi\""), "\"say \"\"hi\"\"\"");
  const r = await tg(["csv", file, "contacts"]);
  assert.ok(r.stdout.startsWith("﻿\"Name\""));
  assert.ok(r.stdout.includes("\"'=HYPERLINK("), "the formula-looking name is neutralised");
  const chats = await tg(["csv", file, "chats"]);
  assert.match(chats.stdout, /Boss @boss/);
  assert.equal((await tg(["csv", file])).code, 1);
  const out = join(dir, "contacts.csv");
  const written = await tg(["csv", file, "contacts", "--out", out]);
  assert.equal(written.code, 0);
  assert.ok(readFileSync(out, "utf8").includes("Ada Lovelace"));
});

test("terminal control characters in names and bios are not passed through", async () => {
  const r = await tg(["contacts", file, "--bio", "--limit", "0"]);
  assert.ok(!r.stdout.includes("\u001b"), "no escape character reaches the screen");
  assert.ok(!r.stdout.includes("\u0007"));
  assert.match(r.stdout, /screen wipe/);
});

test("decrypt gives the plain JSON, to the screen or a file", async () => {
  const r = await tg(["decrypt", file]);
  assert.equal(JSON.parse(r.stdout).contacts.length, 3);
  const out = join(dir, "plain.json");
  const w = await tg(["decrypt", file, "--out", out]);
  assert.match(w.stderr, /NOT locked/);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).format, "tgbackup-export");
});

test("a wrong password opens nothing, and says so in plain words", async () => {
  const r = await tg(["contacts", file], { TGBACKUP_PASSWORD: "not the right password" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Wrong password/);
  assert.equal(r.stdout, "");
});

test("the password can come from a file; there is no --password option", async () => {
  const pw = join(dir, "pw.txt");
  writeFileSync(pw, PASSWORD + "\n");
  assert.equal((await tg(["info", file, "--password-file", pw], {})).code, 0);
  const r = await tg(["info", file, "--password", "x"], {});
  assert.equal(r.code, 2);
  assert.match(r.stderr, /shell history/);
});

test("without a terminal or a password it explains what to do instead of hanging", async () => {
  const r = await tg(["info", file], {});
  assert.equal(r.code, 1);
  assert.match(r.stderr, /TGBACKUP_PASSWORD/);
});

test("files that are not ours, and newer versions, are refused clearly", async () => {
  const plain = join(dir, "notes.txt");
  writeFileSync(plain, "hello");
  assert.match((await tg(["info", plain])).stderr, /not a locked TG Backup file/);
  assert.match((await tg(["info", join(dir, "missing.age")])).stderr, /Can't read/);
  const e = new Encrypter();
  e.setPassphrase(PASSWORD);
  e.setScryptWorkFactor(10);
  const future = join(dir, "future.age");
  writeFileSync(future, await e.encrypt(new TextEncoder().encode(JSON.stringify({ ...doc, version: 2 }))));
  assert.match((await tg(["info", future])).stderr, /format version 2/);
});

test("the real command line works end to end, and --help needs no file", () => {
  const bin = fileURLToPath(new URL("../bin/tgbackup.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [bin, "info", file], { env: { ...process.env, TGBACKUP_PASSWORD: PASSWORD }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Me Myself/);
  const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /no internet/);
});

test("this program contains no network code", () => {
  for (const f of ["../src/cli.mjs", "../src/file.mjs", "../src/query.mjs", "../src/csv.mjs", "../src/prompt.mjs", "../bin/tgbackup.mjs"]) {
    const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");
    assert.doesNotMatch(src, /node:(http|https|net|dgram|dns|tls|http2)\b|\bfetch\(|XMLHttpRequest|WebSocket/, `${f} must not use the network`);
  }
});

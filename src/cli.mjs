// The tgbackup command. Reads a locked TG Backup file you downloaded and shows what is inside. Offline: this program has no network code.
import { readFileSync, writeFileSync } from "node:fs";
import { chatsCsv, contactsCsv } from "./csv.mjs";
import { UserError, openFile, unlock } from "./file.mjs";
import { getPassword } from "./prompt.mjs";
import { chatName, contactName, day, findChatOnly, findChats, findContacts, folderMembers, summary } from "./query.mjs";

const chr = String.fromCharCode;

export const HELP = `tgbackup: open your TG Backup file on your own computer, with no internet.

Usage: tgbackup <command> <file> [options]

Commands
  info <file>                  What the backup holds: counts, account, dates
  contacts <file>              List contacts, most recent conversation first
  chats <file>                 List groups and channels
  folders <file>               Your folders and who is in them
  search <file> <words>        Search names, usernames and bios in contacts, chats and other people
  csv <file> contacts|chats    A spreadsheet (CSV) of contacts or chats
  decrypt <file>               Write the plain JSON (readable by anyone who gets it: keep it safe)

Options
  --search <words>             Only show matches (contacts, chats)
  --needs-invite               chats: only groups you can't rejoin without an invite
  --bio                        contacts: also show each bio
  --limit <n>                  How many rows to list (default 50; 0 = all)
  --json                       Print JSON instead of a table
  --out <file>                 csv and decrypt: write to this file instead of the screen
  --password-file <file>       Read the password from a file (otherwise you are asked)
  -h, --help                   This help

The password is asked for without showing it. You can also set TGBACKUP_PASSWORD. There is no --password
option on purpose: anything typed in the command is saved in your shell history.

The file format is open: https://www.tgbackup.xyz/export-format . Any tool that reads the age format opens the same file.`;

const VALUE_OPTIONS = ["search", "limit", "out", "password-file"];
const FLAGS = ["json", "needs-invite", "bio", "help"];

export function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") opts.help = true;
    else if (a.startsWith("--")) {
      const name = a.slice(2);
      if (FLAGS.includes(name)) opts[name] = true;
      else if (VALUE_OPTIONS.includes(name)) {
        const value = argv[++i];
        if (value === undefined) throw new UserError(`--${name} needs a value.`);
        opts[name] = value;
      } else if (name === "password") throw new UserError("There is no --password option (it would be saved in your shell history). You will be asked for it, or set TGBACKUP_PASSWORD.");
      else throw new UserError(`Unknown option --${name}. Try --help.`);
    } else positional.push(a);
  }
  return { opts, positional };
}

/** Control characters in a name or bio could move the cursor or rewrite the screen. Show them as spaces. */
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp(`[${chr(0)}-${chr(31)}${chr(127)}-${chr(159)}${chr(0x2028)}${chr(0x2029)}]+`, "g");
const clean = (s) => String(s ?? "").replace(CONTROL, " ").trim();

function clip(s, width) {
  const t = clean(s);
  return t.length > width ? t.slice(0, Math.max(1, width - 1)) + "…" : t;
}

/** A plain aligned table. `columns` is [{ key, title, width }]; rows are objects. */
export function table(columns, rows) {
  const widths = columns.map((c) => Math.min(c.width ?? 30, Math.max(c.title.length, ...rows.map((r) => clean(r[c.key]).length))));
  const line = (cells) => cells.map((v, i) => clip(v, widths[i]).padEnd(widths[i])).join("  ").trimEnd();
  return [line(columns.map((c) => c.title)), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(columns.map((c) => r[c.key] ?? "")))].join("\n");
}

function limitOf(opts) {
  if (opts.limit === undefined) return 50;
  const n = Number(opts.limit);
  if (!Number.isInteger(n) || n < 0) throw new UserError("--limit must be a whole number (0 for all).");
  return n === 0 ? Infinity : n;
}

function listed(rows, limit) {
  return { shown: rows.slice(0, limit), more: Math.max(0, rows.length - limit) };
}

const moreNote = (n) => (n > 0 ? `\n… and ${n} more. Use --limit 0 to see all, or --search to narrow it.` : "");

export async function run(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }, env = process.env) {
  const out = (s) => io.out(s + "\n");
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.err(`${e.message}\n`);
    return 2;
  }
  const { opts, positional } = args;
  const [command, file, ...rest] = positional;
  if (opts.help || !command || command === "help") {
    out(HELP);
    return command || opts.help ? 0 : 2;
  }
  const KNOWN = ["info", "contacts", "chats", "folders", "search", "csv", "decrypt"];
  try {
    if (!KNOWN.includes(command)) throw new UserError(`Unknown command "${command}". Try --help.`);
    if (!file) throw new UserError(`Which file? Example: tgbackup ${command} tg-backup-2026-10-20.json.age`);
    let bytes;
    try {
      bytes = new Uint8Array(readFileSync(file));
    } catch {
      throw new UserError(`Can't read ${file}.`);
    }
    const password = await getPassword({ passwordFile: opts["password-file"] }, env);

    if (command === "decrypt") {
      const json = await unlock(bytes, password);
      if (opts.out) {
        writeFileSync(opts.out, json);
        io.err(`Wrote ${opts.out}. It is NOT locked: anyone who gets it can read your contacts.\n`);
      } else io.out(json);
      return 0;
    }

    const doc = await openFile(bytes, password);
    const limit = limitOf(opts);

    if (command === "info") {
      const s = summary(doc);
      if (opts.json) return out(JSON.stringify(s, null, 2)), 0;
      const a = s.account;
      out(`TG Backup file, format version ${doc.version}`);
      out(`Telegram account:   ${clean([a.name, a.username ? `(@${a.username})` : ""].filter(Boolean).join(" ")) || "unknown"}`);
      if (a.bio) out(`Bio:                ${clip(a.bio, 100)}`);
      out(`Backup taken:       ${day(s.takenAt) || "unknown"}`);
      out(`File created:       ${day(s.exportedAt) || "unknown"}`);
      out(`Contacts:           ${s.contacts} (${s.contactsWithBio} with a bio)`);
      out(`Other people:       ${s.chatOnly} (chatted with, not saved as contacts)`);
      out(`Groups/channels:    ${s.chats} (${s.chatsNeedingInvite} need an invite, ${s.chatsWithInviteLink} have a saved invite link)`);
      out(`Folders:            ${s.folders}`);
      return 0;
    }

    if (command === "contacts") {
      const rows = findContacts(doc, { search: opts.search });
      if (opts.json) return out(JSON.stringify(limit === Infinity ? rows : rows.slice(0, limit), null, 2)), 0;
      const { shown, more } = listed(rows, limit);
      const view = shown.map((c) => ({ name: contactName(c), username: c.username ? `@${c.username}` : "", last: day(c.lastContactAt), bio: c.bio ?? "" }));
      const cols = [
        { key: "name", title: "Name", width: 28 },
        { key: "username", title: "Username", width: 24 },
        { key: "last", title: "Last chat", width: 10 },
        ...(opts.bio ? [{ key: "bio", title: "Bio", width: 60 }] : []),
      ];
      out(rows.length ? table(cols, view) + moreNote(more) : "No contacts match.");
      out(`\n${rows.length} contact${rows.length === 1 ? "" : "s"}`);
      return 0;
    }

    if (command === "chats") {
      const rows = findChats(doc, { search: opts.search, needsInvite: !!opts["needs-invite"] });
      if (opts.json) return out(JSON.stringify(limit === Infinity ? rows : rows.slice(0, limit), null, 2)), 0;
      const { shown, more } = listed(rows, limit);
      const view = shown.map((c) => ({
        name: chatName(c),
        kind: c.kind,
        link: c.username ? `t.me/${c.username}` : c.inviteLink ? "invite saved" : "needs an invite",
        members: c.memberCount ?? "",
        last: day(c.lastActivityAt),
      }));
      const cols = [
        { key: "name", title: "Name", width: 36 },
        { key: "kind", title: "Type", width: 10 },
        { key: "link", title: "How to rejoin", width: 22 },
        { key: "members", title: "Members", width: 8 },
        { key: "last", title: "Last activity", width: 12 },
      ];
      out(rows.length ? table(cols, view) + moreNote(more) : "No chats match.");
      out(`\n${rows.length} group${rows.length === 1 ? "" : "s"} or channel${rows.length === 1 ? "" : "s"}`);
      return 0;
    }

    if (command === "folders") {
      const folders = doc.folders.map((f) => ({ ...f, members: folderMembers(doc, f) }));
      if (opts.json) return out(JSON.stringify(folders, null, 2)), 0;
      if (!folders.length) return out("No folders in this backup."), 0;
      for (const f of folders) {
        out(`${f.emoticon ? f.emoticon + " " : ""}${clean(f.title) || "(untitled)"}`);
        const pinned = new Set(f.members.pinned);
        for (const name of f.members.include) out(`  ${clip(name, 70)}${pinned.has(name) ? "  (pinned)" : ""}`);
        if (f.members.exclude.length) out(`  Left out: ${f.members.exclude.map((n) => clip(n, 40)).join(", ")}`);
        const on = Object.keys(f.flags ?? {}).filter((k) => f.flags[k] === true);
        if (on.length) out(`  Also includes: ${on.join(", ")}`);
        out("");
      }
      return 0;
    }

    if (command === "search") {
      const words = [opts.search, ...rest].filter(Boolean).join(" ");
      if (!words) throw new UserError("Search for what? Example: tgbackup search file.age founder");
      const c = findContacts(doc, { search: words });
      const g = findChats(doc, { search: words });
      const o = findChatOnly(doc, { search: words });
      if (opts.json) return out(JSON.stringify({ contacts: c, chats: g, otherPeople: o }, null, 2)), 0;
      const { shown: cs, more: cm } = listed(c, limit);
      if (cs.length) {
        out(`Contacts (${c.length})`);
        out(table([{ key: "name", title: "Name", width: 28 }, { key: "username", title: "Username", width: 24 }, { key: "bio", title: "Bio", width: 60 }], cs.map((x) => ({ name: contactName(x), username: x.username ? `@${x.username}` : "", bio: x.bio ?? "" }))) + moreNote(cm));
        out("");
      }
      const { shown: gs, more: gm } = listed(g, limit);
      if (gs.length) {
        out(`Groups and channels (${g.length})`);
        out(table([{ key: "name", title: "Name", width: 40 }, { key: "kind", title: "Type", width: 10 }, { key: "username", title: "Public", width: 24 }], gs.map((x) => ({ name: chatName(x), kind: x.kind, username: x.username ? `t.me/${x.username}` : "" }))) + moreNote(gm));
        out("");
      }
      const { shown: os, more: om } = listed(o, limit);
      if (os.length) {
        out(`Other people you chatted with (${o.length})`);
        out(table([{ key: "name", title: "Name", width: 28 }, { key: "username", title: "Username", width: 24 }], os.map((x) => ({ name: x.name ?? "", username: x.username ? `@${x.username}` : "" }))) + moreNote(om));
        out("");
      }
      if (!c.length && !g.length && !o.length) out("Nothing matches.");
      return 0;
    }

    if (command === "csv") {
      const what = rest[0];
      if (what !== "contacts" && what !== "chats") throw new UserError("Say which: tgbackup csv <file> contacts   or   tgbackup csv <file> chats");
      const csv = what === "contacts" ? contactsCsv(findContacts(doc, { search: opts.search })) : chatsCsv(findChats(doc, { search: opts.search, needsInvite: !!opts["needs-invite"] }));
      if (opts.out) {
        writeFileSync(opts.out, csv);
        io.err(`Wrote ${opts.out}.\n`);
      } else io.out(csv);
      return 0;
    }
  } catch (e) {
    if (e instanceof UserError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
  return 0;
}

// CSV for spreadsheets. Every cell is quoted, and a leading = + - @ is defused so a contact's name or bio
// can't run as a formula when the file is opened in Excel or Sheets.
import { chatName, contactName, day } from "./query.mjs";

export function cell(value) {
  const s = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const row = (cells) => cells.map(cell).join(",");
const yes = (v) => (v ? "yes" : "");

export function contactsCsv(contacts) {
  const lines = [row(["Name", "Username", "Bio", "Last conversation", "Pinned", "Archived", "Muted"])];
  for (const c of contacts) {
    lines.push(row([contactName(c), c.username ?? "", c.bio ?? "", day(c.lastContactAt), yes(c.pinned), yes(c.archived), yes(c.muted)]));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function chatsCsv(chats) {
  const lines = [row(["Name", "Type", "Public username", "Invite link", "Can rejoin alone", "Members", "Last activity", "Who to ask"])];
  for (const c of chats) {
    const admins = (c.admins ?? []).map((a) => [a.name, a.username ? `@${a.username}` : ""].filter(Boolean).join(" ")).join("; ");
    lines.push(
      row([chatName(c), c.kind, c.username ?? "", c.inviteLink ?? "", c.rejoin === "auto" ? "yes" : "no", c.memberCount ?? "", day(c.lastActivityAt), admins])
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

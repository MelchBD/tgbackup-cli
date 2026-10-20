// Looking things up in an opened document. Pure functions, so they are easy to test.

const text = (v) => (v == null ? "" : String(v));
const lower = (v) => text(v).toLowerCase();

export const day = (iso) => (iso ? String(iso).slice(0, 10) : "");

/** "First Last", else "@username", else "(no name)". */
export function contactName(c) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || (c.username ? `@${c.username}` : "(no name)");
}

export function chatName(c) {
  return text(c.title).trim() || (c.username ? `@${c.username}` : "(no name)");
}

/** Every word of the search must appear (any order) in the haystack. An empty search matches everything. */
export function matches(query, ...fields) {
  const words = lower(query).replace(/^@/, "").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.map(lower).join("\n");
  return words.every((w) => hay.includes(w));
}

/** Most recent conversation first; people never contacted last, then by name. */
function byRecent(nameOf, dateOf) {
  return (a, b) => {
    const da = dateOf(a) ? Date.parse(dateOf(a)) : -Infinity;
    const db = dateOf(b) ? Date.parse(dateOf(b)) : -Infinity;
    if (da !== db) return db - da;
    return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" });
  };
}

export function findContacts(doc, { search = "" } = {}) {
  return doc.contacts
    .filter((c) => matches(search, contactName(c), c.username, c.bio))
    .sort(byRecent(contactName, (c) => c.lastContactAt));
}

export function findChats(doc, { search = "", needsInvite = false } = {}) {
  return doc.chats
    .filter((c) => (needsInvite ? c.rejoin === "needs_invite" : true))
    .filter((c) => matches(search, chatName(c), c.username))
    .sort(byRecent(chatName, (c) => c.lastActivityAt));
}

export function findChatOnly(doc, { search = "" } = {}) {
  return doc.chatOnly.filter((p) => matches(search, p.name, p.username));
}

/** The names behind a folder's member ids, so a folder reads as names rather than numbers. */
export function folderMembers(doc, folder) {
  const contacts = new Map(doc.contacts.map((c) => [String(c.id), contactName(c)]));
  const others = new Map(doc.chatOnly.map((p) => [String(p.id), text(p.name).trim() || (p.username ? `@${p.username}` : "(no name)")]));
  const chats = new Map(doc.chats.map((c) => [String(c.id), chatName(c)]));
  // Telegram numbers groups and channels differently inside folders and in chat lists, so look under both spellings.
  const nameOf = (m) => {
    const id = String(m.id);
    if (m.kind === "user") return contacts.get(id) ?? others.get(id) ?? `user ${id}`;
    return chats.get(id) ?? chats.get(`-${id}`) ?? chats.get(`-100${id}`) ?? `${m.kind} ${id}`;
  };
  return {
    include: (folder.include ?? []).map(nameOf),
    exclude: (folder.exclude ?? []).map(nameOf),
    pinned: (folder.pinned ?? []).map(nameOf),
  };
}

export function summary(doc) {
  const withBio = doc.contacts.filter((c) => c.bio).length;
  return {
    exportedAt: doc.exportedAt ?? null,
    takenAt: doc.backup?.takenAt ?? null,
    account: doc.backup?.account ?? {},
    contacts: doc.contacts.length,
    contactsWithBio: withBio,
    chatOnly: doc.chatOnly.length,
    chats: doc.chats.length,
    chatsNeedingInvite: doc.chats.filter((c) => c.rejoin === "needs_invite").length,
    chatsWithInviteLink: doc.chats.filter((c) => c.inviteLink).length,
    folders: doc.folders.length,
  };
}

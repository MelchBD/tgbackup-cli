# tgbackup: open your TG Backup file offline

You downloaded a backup file from [TG Backup](https://www.tgbackup.xyz) (`tg-backup-2026-10-20.json.age`) and locked it with a
password only you know. This small tool opens it **on your own computer, with no internet and no account**, so you can see what
is in it without restoring anything to a Telegram account.

- It has no network code at all (a test checks that), and it sends nothing anywhere.
- Your password is asked for without showing it, and is never written to disk.
- It works even if tgbackup.xyz is gone. The file format is open: <https://www.tgbackup.xyz/export-format>
  (the same file also opens with the standard [age](https://github.com/FiloSottile/age) tool).

## Install

You need [Node.js](https://nodejs.org) 18 or newer and [git](https://git-scm.com). Then:

```bash
git clone https://github.com/MelchBD/tgbackup-cli.git
cd tgbackup-cli
npm install
```

Run it with `node bin/tgbackup.mjs` (or `npm link` once to get a plain `tgbackup` command).

## Use

```bash
tgbackup info      tg-backup-2026-10-20.json.age     # what is in the backup
tgbackup contacts  tg-backup-2026-10-20.json.age     # contacts, most recent conversation first
tgbackup contacts  tg-backup-2026-10-20.json.age --search founder --bio
tgbackup chats     tg-backup-2026-10-20.json.age --needs-invite
tgbackup folders   tg-backup-2026-10-20.json.age
tgbackup search    tg-backup-2026-10-20.json.age "crypto"   # names, usernames and bios
tgbackup csv       tg-backup-2026-10-20.json.age contacts --out contacts.csv
tgbackup decrypt   tg-backup-2026-10-20.json.age --out backup.json
```

You are asked for the password each time. Other ways to give it:

- `TGBACKUP_PASSWORD` environment variable
- `--password-file path/to/file` (one line)

There is no `--password` option on purpose: anything typed in a command is saved in your shell history.

Options: `--search words`, `--limit n` (default 50, `0` for all), `--json`, `--out file`, `--bio`, `--needs-invite`.

### Good to know

- `decrypt` writes the **unlocked** JSON. Anyone who gets that file can read all your contacts and private invite links, so
  delete it when you are done.
- CSV files are safe to open in Excel or Sheets: names that start with `=`, `+`, `-` or `@` are neutralised so they can't run as formulas.
- Names and bios are shown with control characters removed, so a hostile name can't rewrite your terminal.
- If you forget the password, nobody can open the file. TG Backup never saw it and can't reset it.

## Tests

```bash
npm test
```

## Licence

MIT. See `LICENSE`.

# Clip Forge — Setup & the YouTube "bot check" on Render

## The problem you're hitting

When Clip Forge runs on Render (or any cloud host — AWS, GCP, etc.), YouTube
often refuses to serve the video and yt-dlp reports:

```
ERROR: [youtube] <id>: Sign in to confirm you're not a bot.
```

**This is not a bug in Clip Forge.** YouTube blocks requests coming from known
datacenter IP ranges. The exact same code works fine from a home/residential
connection (that's why it works in local testing but fails on Render).

Clip Forge already tries several unauthenticated workarounds automatically
(alternate `player_client` values: `android`, `ios`, `tv_embedded`). When
YouTube's block is strict — as it currently is for Render — none of those get
through, and **the only reliable fix is to authenticate yt-dlp with cookies**
from a real logged-in YouTube session.

---

## The fix: provide YouTube cookies (one-time, ~5 minutes)

### 1. Export cookies from a browser logged into YouTube

Use a **Netscape-format `cookies.txt`** exporter:

- Chrome/Edge: install the extension **"Get cookies.txt LOCALLY"**
  (open-source, does not upload anything).
- Firefox: **"cookies.txt"** extension.

Steps:
1. Log into `https://www.youtube.com` in that browser with the Google account
   whose channel you're uploading to.
2. Open `https://www.youtube.com` (make sure you're on a youtube.com tab).
3. Click the extension → **Export** → save the file as `youtube-cookies.txt`.

> Tip: use a throwaway/secondary Google account if you're uneasy about putting
> a primary account's cookies on a server. The cookies grant access to that
> YouTube account, so treat the file like a password.

### 2. Add the file to Render as a Secret File

In the Render dashboard for the **API service** (not the frontend):

1. **Environment** → **Secret Files** → **Add Secret File**
2. **Filename:** `youtube-cookies.txt`
   (Render mounts it at `/etc/secrets/youtube-cookies.txt`)
3. **Contents:** paste the entire exported `cookies.txt`
4. Save.

### 3. Point Clip Forge at it

Still on the API service → **Environment** → **Environment Variables**, add:

```
YTDLP_COOKIES_PATH = /etc/secrets/youtube-cookies.txt
```

Save → Render redeploys automatically.

### 4. Retry

Open the failed Clip Forge project and click **Resume** (or **Retry Failed**).
Ingestion re-runs from where it stopped — nothing is re-done that already
succeeded.

---

## Notes & gotchas

- **Cookies expire.** YouTube session cookies are good for a while but not
  forever. If ingestion starts failing with the bot-check again weeks/months
  later, re-export and update the Secret File.
- **Wrong path is the #1 mistake.** If `YTDLP_COOKIES_PATH` points at a file
  that isn't there, Clip Forge logs a clear warning
  (`YTDLP_COOKIES_PATH is set but the file does not exist`) and proceeds
  *without* cookies (so you'll still see the bot-check). Double-check the
  filename matches exactly and the path is `/etc/secrets/<filename>`.
- **Local dev needs nothing.** Leave `YTDLP_COOKIES_PATH` unset locally — a
  residential IP isn't blocked.
- **yt-dlp version.** Pinned in `requirements.txt`. YouTube changes its
  anti-bot logic often; if problems persist even with valid cookies, bump
  `yt-dlp` to the latest release there and redeploy.

---

## Only process videos you're authorized to use

Clip Forge re-publishes the source video as Shorts to your connected channel.
Only run it on videos you own or have permission to reuse — the creation form's
ownership checkbox is there for exactly this reason. Uploading copyrighted
third-party content can get your YouTube channel struck or terminated.

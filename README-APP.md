# LW Songs — Android app (local-first, hosting-independent)

This is your Songs app packaged as a **real installable Android app** using
Capacitor. The app's screens are bundled **inside the app** (in
`android/app/src/main/assets`), so it does **not** depend on lewendew.co.za at
all. It talks only to **Supabase** for song data, and caches songs on the
device so it keeps working offline.

## What's here
- `www/` — the Songs app (index.html + songs.js, with the Supabase keys inlined)
- `android/` — the native Android project (Capacitor)
- `capacitor.config.json` — app id `za.co.lewendew.songs`, name "LW Songs"
- `.github/workflows/build-apk.yml` — builds the installable APK in the cloud

## How to build the installable APK (no developer software needed)
1. Create a free account at github.com.
2. Make a new repository and upload this whole folder to it.
3. GitHub automatically runs the build (the Actions tab). When it finishes,
   open the run and download **LW-Songs-APK** (the `app-debug.apk` file).
4. Put that APK on an Android phone, tap it, allow "install unknown apps,"
   and install. Done — a real app icon, no browser, no URL.

## To update the app later
- Change the files in `www/`, run `npx cap sync android`, push to GitHub —
  a new APK builds automatically.

## Later upgrades we can add
- Store songs in a proper on-device database (SQLite) for rock-solid offline.
- A signed release APK for the Google Play Store.
- The same wrap for the Tracks tool, and an iOS version.

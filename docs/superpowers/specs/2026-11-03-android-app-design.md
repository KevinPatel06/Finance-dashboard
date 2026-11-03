# Android app — design

**Date:** 2026-11-03 · **Status:** awaiting approval

## Intent

Kevin wants to share the phone budget app with **one friend who has an Android phone**. He
sends them an `.apk` file directly; they install it themselves. Not a public release, no Play
Store. Kevin keeps using the iPhone build; nothing about it or the Windows desktop app changes.

Success: the friend installs one file, sees the same app Kevin has on his iPhone (welcome →
setup → Budget · Expenses · More, quick add, warm theme, reminders), types their own name, and
later installs newer `.apk`s **over** the old one without losing their data.

## Goals

- An Android build of the existing phone app (`src/phone/`), from the same `src/` and `core/`.
  No Android-specific screens.
- GitHub Actions produces `FinanceDashboard.apk` as a workflow artifact on every push, next to
  the existing `.ipa`.
- Every APK is signed with **one permanent release key**, so updates install in place.
- Android-native behaviour where users would expect it (below).

## Non-goals

- Play Store listing, store compliance, app bundles (`.aab`).
- Self-updating / update checks. Kevin sends each new file by hand.
- Tablet or landscape layouts.
- Any change to the iPhone or desktop experience.
- Sync between Kevin's and the friend's data (each phone has its own DB).

## Anti-goals (would be a failure even if it "works")

- An update that forces uninstall → friend loses their budget. (Wrong or rotating key.)
- The signing key ending up anywhere public. **The repo is public**: committed files and
  workflow artifacts can be downloaded by anyone.
- The Android back button quitting the app from inside a sheet or a sub-screen.
- The desktop bundle growing or changing because of Android code.

## Decided (by Kevin, in conversation)

- Recipient is one friend; delivery is a sideloaded `.apk` Kevin sends them.
- Same app as the iPhone, nothing different for the friend.
- Updates are manual: Kevin sends a new file; it must install over the old one.
- Signing key created once, stored as a GitHub secret, with a backup copy given to Kevin.

## Claude's calls (Kevin can override)

**One phone bundle for both.** The Vite build that today targets iOS (`vite.config.ios.ts`,
`dist-ios/`) becomes the phone build that Capacitor ships to both iOS and Android. The
compile-time platform constant changes from `'electron' | 'ios'` to `'electron' | 'mobile'`;
every current `__PLATFORM__ === 'ios'` check becomes `'mobile'` (currently in
`src/platform/index.ts`, `src/pages/Settings.tsx`, `src/phone/onboarding/ExportPanel.tsx`,
`src/global.d.ts`). The few real iOS/Android differences are decided at **runtime** with
`Capacitor.getPlatform()`, inside mobile-only code, so the desktop bundle still eliminates all
of it. Whether to rename `src/platform/ios/` → `src/platform/mobile/`, the config file, and the
output dir is left to the builder; a rename is fine if docs (CLAUDE.md) follow.

**Capacitor Android project.** `npx cap add android` (Capacitor 6, matching the existing
`@capacitor/*` 6.x plugins); the generated `android/` folder is committed, like `ios/`. Same
`appId` (`com.kevinpatel.financedashboard`) and app name. Uses the app icon already used for
iOS, generated into Android's mipmaps (adaptive icon on the warm background).

**Android-only behaviour:**
- **Back button / back gesture** (`@capacitor/app` `backButton`): close the top open sheet or
  dialog if there is one; else go back one screen in the phone stack (same as the on-screen
  Back, with the same slide); on a root tab, exit the app (`App.exitApp()` / minimize).
- **Status bar** follows the light/dark theme (icon colour + bar colour matching the page
  background), including when the theme button cross-fades. `@capacitor/status-bar` is the
  expected tool; the builder confirms the WebView doesn't sit under the bar (or applies insets).
- **Portrait only**, matching iPhone (`android:screenOrientation="portrait"`).
- **Notifications**: request permission on Android 13+ at the same moment iOS asks; the three
  repeating reminders (ids 9001–9003) fire on time. Exact-alarm permission handled as
  `@capacitor/local-notifications` 6 requires on Android 12+.
- **Haptics, Share, Filesystem** use the same Capacitor plugins; `haptic()` and the "Share
  database" / export paths run on Android too.
- **Restore stays unavailable on phones** (same as iOS today).
- Android OS auto-backup of app data: builder's call; leaving it on is fine.

**Storage.** The sql.js + Capacitor Filesystem storage (`storage.ts`) is reused as-is,
including the serialised flush, tmp→rename, `.bak` rotation and "never write on open" rules.
The builder confirms Filesystem `rename` over an existing file behaves on Android as the
design assumes; if it doesn't, fix it in the adapter, never by weakening those rules.

**Resume / day change**: reuse the existing `appStateChange` handling (iOS suspends; Android
can also kill and cold-start, which the open path already handles).

**Signing.**
- Key generated **on Kevin's PC** with the `openssl` in Git Bash (no Java here) as an RSA-2048,
  long-validity (≥25 years) PKCS#12 keystore. Never written inside the repo.
- Uploaded with `gh secret set` as `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Running that needs Kevin's OK at the time.
- A backup (keystore + a text file with alias and passwords) saved for Kevin outside the repo,
  e.g. `Documents\Finance Dashboard signing key\`, and he's told to keep it somewhere safe
  (cloud drive / password manager). `.gitignore` gains `*.p12`, `*.jks`, `*.keystore`.
- CI decodes the secret to a temp file and signs the release build. On pull requests (no
  secrets), the Android job builds unsigned or skips signing; it must not fail the PR.

**CI.** A new `android` job in `.github/workflows/` on `ubuntu-latest`, after `test`: Node
24 → `npm ci --ignore-scripts` → phone Vite build → `npx cap sync android` → JDK 17 → Gradle
`assembleRelease` signed with the secret key → upload artifact `FinanceDashboard-apk`
containing `FinanceDashboard.apk`. The iOS job is unchanged apart from the shared build step.
Renaming the workflow (e.g. "Build phone apps") is fine.

**Versioning.** `versionCode` must increase with every build Kevin might send, or Android
refuses the update. Use the GitHub run number (`github.run_number`) as `versionCode` and the
`package.json` version as `versionName`.

## Constraints

- Shared code rules from CLAUDE.md hold: tiny `core/db.ts` surface, positional `?` binding,
  Capacitor plugins in `devDependencies`, no `?url` imports for platform assets, desktop
  pixel-identical at `md`+.
- Kevin has no Android SDK or Java on his PC: the APK is built only in CI. Local checks are
  the test suite, type-check and the Vite builds; `npx cap add/sync android` works on Windows.
- Repo contract tests must keep passing on both drivers.

## Left to the builder

- Exact file/dir renames for the shared phone build.
- How the back-button handler finds "the top sheet" (e.g. a small stack registered by `Sheet`
  and the confirm dialog) and talks to `PhoneLayout`'s screen stack.
- Status-bar plugin wiring and colours per theme.
- Minimum Android version (Capacitor 6 default is fine).
- Gradle signing config details.

## Getting the file to the friend

GitHub wraps every artifact in a `.zip`. Kevin downloads `FinanceDashboard-apk.zip` from the
run, unzips it, and sends the friend `FinanceDashboard.apk` (chat app, email, Drive). The
first install asks the friend to allow "Install unknown apps" for whichever app opened the
file. Updates: same steps, and the phone shows "Update" instead of "Install". The builder adds
these steps to CLAUDE.md so they're findable later.

## How Kevin verifies

- CI run is green; artifacts list both `FinanceDashboard-ipa` and `FinanceDashboard-apk`.
- On an Android phone (the friend's, or an emulator if one is handy): install, run setup, add
  an expense, background and reopen (data kept), back button closes a sheet, leaves a
  sub-screen, exits from a tab; a reminder arrives; install the next CI build over it and the
  data is still there.
- iPhone build and desktop app behave exactly as before.

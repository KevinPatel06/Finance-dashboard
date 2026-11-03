# Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing phone app as a signed, updatable Android `.apk` built by GitHub Actions.

**Architecture:** The Vite "iOS" build becomes one *mobile* build that Capacitor ships to both
iOS and Android; `__PLATFORM__` becomes `'electron' | 'mobile'`, and the few iOS/Android
differences are runtime `Capacitor.getPlatform()` checks inside mobile-only modules. A small
back-handler stack lets Android's back button close the top sheet/dialog, then step back.
CI gains an Ubuntu job that runs Gradle with a permanent keystore held in repo secrets.

**Tech Stack:** Capacitor 6 (`@capacitor/android`, `@capacitor/status-bar`), Gradle/JDK 17,
GitHub Actions, OpenSSL (key generation), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-android-app-design.md`

## Global Constraints

- appId `com.kevinpatel.financedashboard`, appName `Finance Dashboard` (unchanged).
- All `@capacitor/*` packages stay on major **6** and go in **devDependencies**.
- Desktop bundle must not change: no Android code reachable when `__PLATFORM__ === 'electron'`.
- iPhone behaviour unchanged (status-bar and back-button code run only when `getPlatform() === 'android'`).
- Repo is **public**: keystore, passwords and base64 never committed, printed in CI logs, or uploaded as artifacts. `.gitignore` gains `*.p12`, `*.jks`, `*.keystore`.
- Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- `versionCode` = `github.run_number`; `versionName` = `package.json` `version`.
- Artifact name `FinanceDashboard-apk`, file `FinanceDashboard.apk`.
- Portrait only. Positional `?` SQL binding, tiny `core/db.ts` surface untouched.
- Local machine has no JDK/Android SDK: the APK is only built in CI. Local checks:
  `node node_modules/typescript/bin/tsc -b`, `node node_modules/vitest/vitest.mjs run`,
  `node node_modules/vite/bin/vite.js build`, `node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts`.

## Review Focus

1. Back pressed while a ConfirmDialog sits on top of an open Sheet → only the dialog closes. (Task 2 test: LIFO order.)
2. Back pressed on the first setup step for a fresh user (FlowShell has no `onBack`) → app minimizes, doesn't navigate to a blank history entry. (Task 2: `handleBack()` returns false when empty; router falls through to minimize on root paths.)
3. A handler unregistered out of order (sheet A closed while B is still open) leaves B as top. (Task 2 test.)
4. Pull-request CI run (no secrets) → Android job still passes, producing an unsigned build or skipping signing. (Task 4: gradle signing only when env vars present.)
5. Second CI build installs over the first → same key, higher versionCode. (Task 4: run_number wired; Task 5 manual check.)

---

### Task 1: Rename the iOS build to a shared mobile build

**Files:**
- Move: `src/platform/ios/` → `src/platform/mobile/`; `vite.config.ios.ts` → `vite.config.mobile.ts`
- Modify: `src/global.d.ts`, `src/platform/index.ts`, `src/platform/mobile/api.ts`, `src/pages/Settings.tsx`, `src/phone/onboarding/ExportPanel.tsx`, `capacitor.config.ts`, `package.json`, `tsconfig.json`, `.gitignore`, `scripts/phone-shots.mjs`, `test/iosFlush.test.ts`, `test/repo.sqljs.test.ts`, `.github/workflows/ios.yml`

**Interfaces:**
- Produces: `__PLATFORM__: 'electron' | 'mobile'`; `installMobileApi(): Promise<void>` in `src/platform/mobile/api.ts`; mobile build output `dist-mobile/` (Capacitor `webDir`); npm script `build:mobile` = `vite build --config vite.config.mobile.ts`, plus `build:ios` = `npm run build:mobile && cap sync ios`.

- [ ] **Step 1:** `git mv` the dir and config; replace every `'ios'` platform comparison with `'mobile'`, `installIosApi` → `installMobileApi`, `dist-ios` → `dist-mobile`, `vite.config.ios.ts` → `vite.config.mobile.ts`, import paths `platform/ios/` → `platform/mobile/` (list from `grep -rln "platform/ios\|vite.config.ios\|dist-ios\|installIosApi" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .`, excluding generated `dist-ios/` and `ios/App/App/public|capacitor.config.json`). Keep `.gitignore` entries for both `dist-ios/` (stale local dir) and `dist-mobile/`. Comments that say "iOS" about shared mobile behaviour become "phone".
- [ ] **Step 2:** Run `tsc -b`, the test suite, desktop build and mobile build. Expected: tsc exit 0, 176 tests pass, both builds succeed, `grep -c "sql-wasm" dist/assets/*.js` finds nothing in the desktop bundle.
- [ ] **Step 3:** `npx cap sync ios` succeeds (copies `dist-mobile` into `ios/App/App/public`).
- [ ] **Step 4:** Commit `refactor: one mobile build for iOS and Android`.

### Task 2: Back-handler stack and Android back button

**Files:**
- Create: `src/lib/backStack.ts`, `src/platform/mobile/androidBack.ts`
- Modify: `src/phone/ui/Sheet.tsx`, `src/components/ui/Modal.tsx`, `src/components/ui/ConfirmDialog.tsx`, `src/phone/onboarding/FlowShell.tsx`, `src/phone/PhoneApp.tsx`, `src/platform/index.ts`
- Test: `test/unit/backStack.test.ts`

**Interfaces:**
- Produces (`src/lib/backStack.ts`, no DOM/Capacitor imports):
  - `pushBack(handler: () => void): () => void` — registers on top; returns an unregister fn (idempotent).
  - `handleBack(): boolean` — calls the top handler and returns `true`; `false` if empty. Does not remove the handler (the overlay unregisters itself when it closes).
  - `useBackHandler(handler: (() => void) | undefined, active: boolean): void` — React hook: while `active && handler`, keeps it registered (latest handler via ref, registration order = mount order).
- Produces (`src/platform/index.ts`): `onAndroidBack(fallback: () => void): () => void` — no-op returning `() => {}` unless mobile + android; otherwise lazy-imports `androidBack.ts`, which adds an `App.addListener('backButton', …)` that runs `handleBack() || fallback()`.

- [ ] **Step 1: Write the failing tests** in `test/unit/backStack.test.ts`:
  - `handleBack returns false when nothing is registered`
  - `the most recently registered handler runs first` (push A, push B → handleBack calls B only)
  - `unregistering out of order keeps the right top` (push A, push B, unregister A → handleBack calls B; unregister B → handleBack returns false)
  - `unregister is idempotent` (calling it twice doesn't remove another handler)
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run test/unit/backStack.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/backStack.ts` (array of `{ id, handler }`; tests must not share state — export a `_resetBackStack()` for tests or reset in `beforeEach`).
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Register overlays: `Sheet` → `useBackHandler(onClose, open)`; `Modal` → `useBackHandler(onClose, open)`; `ConfirmDialog` → `useBackHandler(onCancel, open)`; `FlowShell` → `useBackHandler(onBack, !!onBack)`.
- [ ] **Step 6:** In `PhoneApp`, `useEffect(() => onAndroidBack(fallback), [...])` where `fallback` = if `location.pathname` is in `TAB_PATHS` (or onboarding isn't done) → `App.minimizeApp()` (done inside `androidBack.ts`, so pass a flag-returning fn: `fallback(): 'minimize' | void` — the module minimizes when the fallback returns `'minimize'`), else `navigate(-1)`.
- [ ] **Step 7:** Full suite, tsc, both builds → green. Desktop bundle contains no `backButton` string: `grep -l backButton dist/assets/*.js` → no output.
- [ ] **Step 8:** Commit `feat(android): back button closes sheets, then steps back`.

### Task 3: Capacitor Android project, status bar, icon, notifications

**Files:**
- Create: `android/` (generated), `android/app/src/main/res/drawable-nodpi/ic_launcher_full.png` (copy of `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`), `android/app/src/main/res/drawable/ic_stat_notify.xml` (white 24dp vector: the icon's two crossed bars), `src/platform/mobile/statusBar.ts`
- Modify: `package.json` (devDeps `@capacitor/android@^6`, `@capacitor/status-bar@^6`), `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml`, legacy `mipmap-*/ic_launcher*.png` (delete; point `@mipmap/ic_launcher` at the nodpi drawable via `mipmap-anydpi` + a `drawable` alias for pre-26), `android/app/build.gradle`, `src/platform/index.ts`, `src/lib/theme.tsx`, `.gitignore`

**Interfaces:**
- Produces: `setStatusBar(theme: 'light' | 'dark'): void` in `src/platform/index.ts` — no-op unless mobile + android; lazy-imports `statusBar.ts`, which sets `Style.Light`/`Style.Dark` icons and background `#EEE5D5` (light) / `#1D1E1C` (dark) — the `--surface` values in `html.phone`.
- Produces (Gradle): reads env `VERSION_CODE` (default 1), `VERSION_NAME` (default `1.0.0`), and signing env `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; `release` uses the signing config **only when `ANDROID_KEYSTORE_FILE` is set**.

- [ ] **Step 1:** `npm install -D --ignore-scripts @capacitor/android@^6 @capacitor/status-bar@^6` then `npx cap add android` (works without the SDK). `.gitignore`: `android/app/build/`, `android/build/`, `android/.gradle/`, `android/app/src/main/assets/public/`, `android/local.properties`, `*.p12`, `*.jks`, `*.keystore`.
- [ ] **Step 2:** Manifest: main activity `android:screenOrientation="portrait"`; add `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />` (POST_NOTIFICATIONS comes from the plugin). `capacitor.config.ts`: `plugins.LocalNotifications.smallIcon = 'ic_stat_notify'`, `iconColor` = brand green used by the phone theme; `android.backgroundColor = '#EEE5D5'`.
- [ ] **Step 3:** Icon: adaptive icon `background` = `@drawable/ic_launcher_full`, `foreground` = transparent; same for `_round`; pre-26 `@mipmap/ic_launcher` resolves to the same drawable. Remove Capacitor's default launcher PNGs.
- [ ] **Step 4:** `build.gradle`: `versionCode`/`versionName` from env; `signingConfigs.release` from env; `buildTypes.release.signingConfig` set only when the keystore env is present; `minifyEnabled false`.
- [ ] **Step 5:** Call `setStatusBar(t)` wherever `applyTheme(t)` runs for the phone (in `src/lib/theme.tsx`, guarded so it's only called when the `phone` class is on `<html>`; desktop branch compiled out).
- [ ] **Step 6:** `notify.ts`: confirm the existing `requestPermissions()` path covers Android 13+; on Android, before scheduling repeating reminders, if `checkExactNotificationSetting()` reports denied, still schedule (inexact is acceptable) — never throw.
- [ ] **Step 6b:** Read `node_modules/@capacitor/filesystem/android/src/main/java/**/Filesystem*.java` and confirm `rename` replaces an existing destination file (what `storage.ts`'s tmp→`finance.db` rename relies on). If it refuses, make `storage.ts` delete `finance.db` only *after* the `.bak` copy succeeded and immediately before the rename, on Android only — and add that case to `test/iosFlush.test.ts`. Never weaken the never-write-on-open / serialised-flush rules.
- [ ] **Step 7:** `npx cap sync android` succeeds; tsc, tests, both builds green; desktop bundle has no `StatusBar` string.
- [ ] **Step 8:** Commit `feat(android): add Capacitor Android project`.

### Task 4: Signing key and CI job

**Files:**
- Modify: `.github/workflows/ios.yml` → rename to `.github/workflows/phone.yml` (name "Build phone apps"), add `android` job
- Outside repo: `C:\Users\Kevin Patel\Documents\Finance Dashboard signing key\finance-dashboard.p12` + `README.txt` (alias, both passwords, what it's for, "never lose this")

**Interfaces:**
- Consumes: Gradle env from Task 3; `build:mobile` from Task 1.

- [ ] **Step 1: (needs Kevin's OK)** Generate with Git Bash OpenSSL, in the backup folder, never in the repo: RSA-2048 self-signed cert, 9125 days, CN=Finance Dashboard; export PKCS#12 with alias `financedashboard`, random 32-char password (same for store and key). Write `README.txt`.
- [ ] **Step 2: (needs Kevin's OK)** `gh secret set` the four secrets (base64 piped via stdin, never echoed). Verify: `gh secret list` shows all four.
- [ ] **Step 3:** `android` job (`needs: test`, `ubuntu-latest`): checkout → Node 24 + npm cache → `npm ci --ignore-scripts` → `npm run build:mobile` → `npx cap sync android` → `actions/setup-java@v4` (temurin 17) → decode `ANDROID_KEYSTORE_BASE64` to `$RUNNER_TEMP/release.p12` only if the secret is non-empty → `./gradlew assembleRelease` in `android/` with `VERSION_CODE=${{ github.run_number }}`, `VERSION_NAME` from `node -p "require('./package.json').version"`, signing env → copy `app/build/outputs/apk/release/app-release*.apk` to `$RUNNER_TEMP/FinanceDashboard.apk` → upload artifact `FinanceDashboard-apk`. iOS job uses `npm run build:mobile`.
- [ ] **Step 4:** Commit `ci: build a signed Android apk`, push, watch the run. Expected: test, build (iOS), android all green; artifacts `FinanceDashboard-ipa` and `FinanceDashboard-apk`. Verify signature in CI with `apksigner verify --print-certs` (prints SHA-256 digest, not secrets) as a step.

### Task 5: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Update CLAUDE.md: "two apps" → desktop + phone (iOS & Android); `build:mobile`/`dist-mobile`/`src/platform/mobile/`; Android section (back stack, status bar, portrait, signing secrets + backup folder, versionCode = run number, "never regenerate the key"); how to get the APK to the friend (download zip from the run, unzip, send `FinanceDashboard.apk`; first install needs "Install unknown apps"; updates install over).
- [ ] **Step 2:** Commit `docs: Android app`, push.

# Publishing to Google Play and the App Store

Sunset Drift is an installable web app (manifest, service worker, HTTPS), so
it can ship to the stores without rewriting the game.

## Already done in the code

- **Privacy policy** at `/privacy` (linked from the first screen, the account
  panel and Settings). Use this URL in both store listings.
- **In-game account deletion**: account panel → *Delete my account*, confirmed
  with the password. Required by Apple and Google for apps with sign-up.
- **No real brand names**: cars use invented brands and models; a test fails
  if a real manufacturer name comes back.
- **Android ownership file** served by the Worker at
  `/.well-known/assetlinks.json` from two Cloudflare variables (below).
- **Moderation**: the admin dashboard can ban accounts with offensive names.

## Google Play (Android) — Trusted Web Activity

The Android app is a thin shell that opens the live site full screen. Game
updates reach players as soon as you push; only icon or name changes need a
new upload.

1. **Create a Play developer account** at <https://play.google.com/console>
   (one-time US$25, identity check).
2. **Generate the Android package** with PWABuilder: open
   <https://www.pwabuilder.com>, enter your live game URL, choose
   **Android → Generate package**.
   - Package ID: e.g. `com.sunsetdrift.game` (permanent, cannot change later).
   - App name: `Sunset Drift`; display mode: fullscreen; orientation: landscape.
   - Download the zip. **Keep the `signing.keystore` file and its passwords
     safe**: you need them for every update.
3. **Create the app in Play Console** and upload the `.aab` from the zip
   (start with *Internal testing*). Turn on **Play App Signing** (default).
4. **Verify that the app owns the site** (removes the browser address bar):
   - Play Console → your app → **Setup → App signing** → copy the **SHA-256
     certificate fingerprint** of the *app signing key*.
   - Cloudflare → `sunset-drift` Worker → **Settings → Variables and Secrets**:
     - `ANDROID_PACKAGE` = your package ID (e.g. `com.sunsetdrift.game`)
     - `ANDROID_CERT_SHA256` = the fingerprint. To also allow the upload key
       from PWABuilder, add both separated by a comma.
   - Redeploy, then open `https://<your-site>/.well-known/assetlinks.json` and
     check it shows your package and fingerprint.
5. **Store listing**: short and full description, 512×512 icon
   (`assets/icon-512.png`), a 1024×500 feature graphic, at least two phone
   screenshots (landscape), privacy policy URL `https://<your-site>/privacy`.
6. **App content forms**:
   - *Data safety*: collects **email**, **username** (user IDs) and **game
     progress** (app activity) for account management and app functionality;
     encrypted in transit; users can request deletion (in app); not shared.
   - *Content rating*: racing game, no violence, users can interact online
     (usernames only), no purchases.
   - *Target audience*: 13+ is the simplest choice with accounts and online play.
   - *Ads*: no ads.
7. Promote from Internal testing → Closed testing → Production. New personal
   developer accounts must run a closed test with testers before production.

## Apple App Store (iPhone and iPad)

Not set up yet. It needs:

- An Apple Developer account (US$99/year) and Xcode on your Mac.
- A native shell (Capacitor) that **bundles** the game: Apple usually rejects
  apps that only load a website (guideline 4.2).
- **Token-based sign-in**: a bundled app runs from its own origin, so the
  current same-site session cookie cannot reach the API. The API needs a
  bearer-token mode for the app.
- Native touches that help review: haptics, Game Center leaderboards.
- Privacy "nutrition label" answers matching the Data safety form above.

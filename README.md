# Vault

Vault is a mobile-first React prototype for cataloging household items by location, photo, blue pin markers, and item lists.

## Run locally

```sh
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Cloud login setup

Vault uses Firebase for cross-device accounts and cloud storage:

- Firebase Authentication for email/password login
- Firestore for locations, image records, pins, and item lists
- Firebase Storage for uploaded photos

Create a Firebase web app, enable Email/Password sign-in, create a Firestore database, and enable Storage. Copy `.env.example` to `.env.local` and fill in the Firebase web app values before running locally or deploying.

## Android native setup

Vault's Android package id is `com.glmorris1.vault` and uses the existing Firebase project, `vault-4e944`.

1. In the existing Firebase project, open Project settings > Your apps.
2. Add an Android app with package name `com.glmorris1.vault`.
3. Download the generated `google-services.json`.
4. Place it at `android/app/google-services.json`. Do not commit that real file.
5. Run `npm run sync:android`, then open the project with `npm run open:android`.

Android App Links are configured for:

- `https://glmorris1.github.io/vault/...`
- `https://vault-4e944.firebaseapp.com/...`
- `https://vault-4e944.web.app/...`

For verified App Links, the matching `assetlinks.json` must be served from each host's `/.well-known/assetlinks.json` path with the release signing certificate fingerprint.

## Prototype features

- Dashboard with location cards and instant search
- Search across locations, image names, pin names, item names, quantities, values, and notes
- Add, rename, and delete locations
- Upload images or use the device camera when available
- Rename and delete images
- Tap an image to place responsive percentage-based blue pins
- Add, edit, delete, and reorder items at each pin
- Optional pin notes, item notes, quantity, and estimated value
- Email/password registration and login
- Per-user cloud sync when Firebase is configured
- Local browser persistence remains as a preview fallback
- Import/export JSON backup for migration testing

## Architecture notes

The app is organized around the same domain objects that could map cleanly into a future Swift/Xcode rebuild:

- `Location`
- `Image`
- `Pin`
- `Item`

The current local storage adapter lives in `src/data/storage.js`, while Firebase auth/sync lives in `src/services/firebase.js`. A native version could replace those adapters with SwiftData, Core Data, CloudKit, or a first-party API while keeping the same conceptual model.

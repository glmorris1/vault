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

# Vault

Vault is a mobile-first React prototype for cataloging household items by location, photo, blue pin markers, and item lists.

## Run locally

```sh
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Prototype features

- Dashboard with location cards and instant search
- Search across locations, image names, pin names, item names, quantities, values, and notes
- Add, rename, and delete locations
- Upload images or use the device camera when available
- Rename and delete images
- Tap an image to place responsive percentage-based blue pins
- Add, edit, delete, and reorder items at each pin
- Optional pin notes, item notes, quantity, and estimated value
- Local browser persistence through `localStorage`
- Import/export JSON backup for migration testing

## Architecture notes

The app is organized around the same domain objects that could map cleanly into a future Swift/Xcode rebuild:

- `Location`
- `Image`
- `Pin`
- `Item`

The current storage adapter lives in `src/data/storage.js`. A native version could replace that adapter with SwiftData, Core Data, CloudKit, or file-backed storage while keeping the same conceptual model.

# Vault AI Photo Assistant Function

This folder contains the secure backend for `analyzePhotoWithAI`.

## Configure

Install dependencies:

```bash
cd functions
npm install
```

Add the OpenAI key as a Firebase Secret so it is never exposed to React:

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

The function uses `gpt-4o-mini`, which supports vision inputs and Structured Outputs.

## Build and Deploy

```bash
cd functions
npm run build
firebase deploy --only functions
```

The React app calls the callable function named `analyzePhotoWithAI`. The function requires a signed-in Firebase user, verifies the photo is stored under `users/{uid}/images/`, checks the photo appears in the user's Vault Firestore document, downloads it from Firebase Storage, and then sends it to OpenAI with Structured Outputs.

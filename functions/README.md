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

`OPENAI_MODEL` defaults to `gpt-5.4-mini`. Firebase will prompt for parameter values during deploy if needed.

## Build and Deploy

```bash
cd functions
npm run build
firebase deploy --only functions
```

The React app calls the callable function named `analyzePhotoWithAI`. The function requires a signed-in Firebase user, verifies the photo is stored under `users/{uid}/images/`, checks the photo appears in the user's Vault Firestore document, downloads it from Firebase Storage, and then sends it to OpenAI with Structured Outputs.

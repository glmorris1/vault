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

## Alexa Skill Endpoint

This folder also contains an HTTPS endpoint named `alexaVaultSkill`.

After deploy, use this URL as the Alexa custom skill endpoint:

```text
https://us-central1-vault-4e944.cloudfunctions.net/alexaVaultSkill
```

For Alexa account linking, use Auth Code Grant:

```text
Your Web Authorization URI:
https://us-central1-vault-4e944.cloudfunctions.net/alexaAuthorize

Access Token URI:
https://us-central1-vault-4e944.cloudfunctions.net/alexaToken

Client ID:
vault-alexa-skill

Authentication Scheme:
HTTP Basic (Recommended)

Scope:
vault:read

Domain List:
us-central1-vault-4e944.cloudfunctions.net
identitytoolkit.googleapis.com
```

Use the Alexa Developer Console-generated redirect URLs in the "Your Redirect URLs" section. The Vault authorization page will redirect back to whichever Alexa redirect URL Amazon sends in the OAuth request.

Set the Alexa skill id as a Firebase Functions parameter before deploying. The easiest local setup is to create `functions/.env.vault-4e944` and keep it out of Git:

```text
ALEXA_SKILL_ID=amzn1.ask.skill.your-skill-id-here
ALEXA_CLIENT_ID=vault-alexa-skill
FIREBASE_WEB_API_KEY=your-firebase-web-api-key
```

Keep using Firebase Secret Manager for actual secrets such as `OPENAI_API_KEY` and `ALEXA_CLIENT_SECRET`:

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ALEXA_CLIENT_SECRET
```

The endpoint uses the official Alexa SDK Express adapter, so Alexa request certificate and timestamp checks are handled by the SDK adapter. The function also checks `ALEXA_SKILL_ID` when configured.

### Account Linking

The skill will not read Vault data unless it can resolve the Alexa user to a Vault user.

Supported lookup paths:

1. The built-in OAuth flow through `alexaAuthorize` and `alexaToken`.
2. `context.System.user.accessToken` is a Firebase ID token. This is useful for early testing.
3. Firestore contains `alexaLinks/{alexaUserId}` with:

```json
{
  "uid": "firebase-user-uid"
}
```

Do not put Alexa secrets or Firebase admin credentials in the React/Capacitor app.

### Initial Interaction Model

Create these custom intents in the Alexa console:

```json
{
  "interactionModel": {
    "languageModel": {
      "invocationName": "vault",
      "intents": [
        {
          "name": "FindItemIntent",
          "slots": [
            {
              "name": "item",
              "type": "AMAZON.SearchQuery"
            }
          ],
          "samples": [
            "where is {item}",
            "where are {item}",
            "find {item}",
            "where did I put {item}"
          ]
        },
        {
          "name": "ListPinItemsIntent",
          "slots": [
            {
              "name": "pin",
              "type": "AMAZON.SearchQuery"
            }
          ],
          "samples": [
            "what is in {pin}",
            "what's in {pin}",
            "what do I have in {pin}",
            "list items in {pin}"
          ]
        },
        {
          "name": "AMAZON.HelpIntent",
          "samples": []
        },
        {
          "name": "AMAZON.CancelIntent",
          "samples": []
        },
        {
          "name": "AMAZON.StopIntent",
          "samples": []
        },
        {
          "name": "AMAZON.FallbackIntent",
          "samples": []
        }
      ]
    }
  }
}
```

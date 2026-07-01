1. OAuth client exists ✅ already done (it's how your own operator refresh token was minted). Go to console.cloud.google.com → your existing project → APIs & Services → Credentials and confirm the OAuth 2.0 Client ID is there. If #204/#205 will need specific redirect URIs later, you can add placeholder ones now or edit later — redirect-URI edits don't require re-verification.

2. Consent screen scopes → APIs & Services → OAuth consent screen → Data Access / Scopes. Confirm only drive.file and spreadsheets are listed (not drive or drive.readonly). Also confirm User type = External (Internal apps skip verification but only work for Workspace-org users — your users are personal Gmail, so it must be External).

3. Fill the required consent-screen fields (Google won't accept submission without these):

- App name, support email, developer contact email
- Privacy policy URL and Terms of service URL — you need real pages live at these URLs before submitting
- Authorized domain (your prod domain, leondev.xyz per your deploy setup)
- App logo (optional but speeds review)

4. Publish → Production. OAuth consent screen page has a "Publish App" button — flips from Testing to In production. Do this before or alongside submitting verification.

5. Submit sensitive-scope verification. Same page → "Prepare for verification" → you'll justify why you need spreadsheets (sensitive scope). Typically wants a short explanation + a screen-recording showing the OAuth consent flow and how each scope is used in-product. drive.file alone wouldn't need this, but spreadsheets does. This is the days-to-weeks Google review — nothing more to do after submitting except wait and respond to any follow-up questions from the review team.

6. Client ID/secret delivered to deployment — likely already satisfied since prod is presumably already running with these vars for your own operator refresh token. Worth a quick check that /opt/vig's .env on the VPS has real (non-empty) GOOGLE_OAUTH_CLIENT_ID/\_SECRET values, not placeholders.

Nothing here needs a PR or a branch — want me to check the prod .env on the

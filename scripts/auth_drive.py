"""
One-time OAuth flow to get a refresh token covering Drive + Sheets.

Usage:
    pip install google-auth-oauthlib
    python scripts/auth_drive.py

Then paste the printed values into your .env file.
"""

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

flow = InstalledAppFlow.from_client_secrets_file(
    "credentials/oauth_client.json",
    scopes=SCOPES,
)
creds = flow.run_local_server(port=0)

print("\n--- Add these to your .env ---")
print(f"GOOGLE_OAUTH_CLIENT_ID={creds.client_id}")
print(f"GOOGLE_OAUTH_CLIENT_SECRET={creds.client_secret}")
print(f"GOOGLE_OAUTH_REFRESH_TOKEN={creds.refresh_token}")

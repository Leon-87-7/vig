import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — vig',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-16">
      <article className="prose prose-invert mx-auto max-w-2xl text-ink">
        <h1>Privacy Policy — VIG (Video Intelligence Gateway)</h1>
        <p className="text-muted">Last updated: July 1, 2026</p>

        <p>
          VIG is a Telegram bot and dashboard that processes video links
          (Instagram Reels, YouTube Shorts, TikTok, YouTube), runs them
          through AI enrichment, and stores the results for you.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            Your Telegram identity (chat ID, name, username) — used to
            identify your account and route your data.
          </li>
          <li>
            Links/videos you send us, and the AI-generated analysis of them
            (transcripts, descriptions, tags).
          </li>
          <li>
            If you connect your Google account: an OAuth token scoped to
            Google Drive (<code>drive.file</code>) and Google Sheets (
            <code>spreadsheets</code>). This lets VIG create a{' '}
            <code>/vig</code> folder and spreadsheet in your Drive and write
            your results there. VIG can only see or edit files it creates
            itself — it cannot access any other file already in your Drive.
          </li>
        </ul>

        <h2>What we don&apos;t collect</h2>
        <ul>
          <li>
            We never request access to your Gmail, your existing Drive
            files, or any Google data beyond the scopes listed above.
          </li>
          <li>We don&apos;t sell or share your data with third parties.</li>
        </ul>

        <h2>How your data is stored</h2>
        <p>
          Video analysis results are stored in a private database and cloud
          storage bucket, scoped to your Telegram account. Your Google OAuth
          token, if you connect one, is stored encrypted and used only to
          write your own results to your own Drive/Sheets.
        </p>

        <h2>Revoking access</h2>
        <p>
          Send <code>/disconnect</code> to the bot at any time to revoke your
          Google connection — this deletes your stored token and revokes it
          with Google. You can also revoke access directly from your{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account&apos;s third-party access settings
          </a>
          .
        </p>

        <h2>Contact</h2>
        <p>
          Questions? Email{' '}
          <a href="mailto:leoneidelman09@gmail.com">
            leoneidelman09@gmail.com
          </a>
          .
        </p>
      </article>
    </main>
  );
}

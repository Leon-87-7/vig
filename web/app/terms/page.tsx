import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — vig',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-16">
      <article className="prose prose-invert mx-auto max-w-2xl text-ink">
        <h1>Terms of Service — VIG (Video Intelligence Gateway)</h1>
        <p className="text-muted">Last updated: July 1, 2026</p>

        <p>
          By using the VIG Telegram bot or dashboard, you agree to these
          terms.
        </p>

        <h2>The service</h2>
        <p>
          VIG processes video links you send it (Instagram Reels, YouTube
          Shorts, TikTok, YouTube), runs them through AI enrichment, and
          stores/returns the results to you. It is provided as-is, without
          warranty, and may change or become unavailable at any time.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>Only submit content you have the right to process.</li>
          <li>
            Don&apos;t use the service for illegal purposes or in violation
            of the terms of the platforms the videos come from (Instagram,
            YouTube, TikTok).
          </li>
        </ul>

        <h2>Google account connection</h2>
        <p>
          If you connect a Google account, VIG creates files (a{' '}
          <code>/vig</code> folder, spreadsheet, and uploads) in your own
          Drive using the <code>drive.file</code> and{' '}
          <code>spreadsheets</code> scopes. VIG only ever touches files it
          created. You can disconnect at any time by sending{' '}
          <code>/disconnect</code>.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          VIG is a personal project, provided without warranty of any kind.
          We are not liable for any loss or damage arising from its use.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may change; continued use after a change means you
          accept the new terms.
        </p>

        <h2>Contact</h2>
        <p>
          <a href="mailto:leoneidelman09@gmail.com">
            leoneidelman09@gmail.com
          </a>
        </p>
      </article>
    </main>
  );
}

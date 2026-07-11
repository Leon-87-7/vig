import type { Metadata } from 'next';
import LoginClient from './login-client';

// Thin auth page — keep it out of search results but let bots follow the
// back-link to the landing page.
export const metadata: Metadata = {
  title: 'Sign in — Ownix',
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginPage() {
  return <LoginClient />;
}

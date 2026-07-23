import type { Metadata } from 'next';
import { OfflineState } from '@/components/shell/offline-state';

export const metadata: Metadata = {
  title: 'Offline · Ownix',
  description: 'Ownix is offline. It reconnects on its own.',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return <OfflineState />;
}

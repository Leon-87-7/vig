// @vitest-environment jsdom
import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it } from 'vitest';
import { SubmitJobProvider, useSubmitJob } from './submit-job';

function ShortcutProbe() {
  const { open } = useSubmitJob();
  return <span>{open ? 'submit open' : 'submit closed'}</span>;
}

describe('SubmitJobProvider', () => {
  it('opens Submit URL with the N shortcut', () => {
    render(
      <SubmitJobProvider>
        <ShortcutProbe />
      </SubmitJobProvider>,
    );

    expect(screen.getByText('submit closed')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'n' });

    expect(screen.getByText('submit open')).toBeTruthy();
  });

  it('does not open Submit URL while typing in a field', () => {
    render(
      <SubmitJobProvider>
        <input aria-label="Notes" />
        <ShortcutProbe />
      </SubmitJobProvider>,
    );

    const notes = screen.getByLabelText('Notes');
    notes.focus();
    fireEvent.keyDown(notes, { key: 'n' });

    expect(screen.getByText('submit closed')).toBeTruthy();
  });
});

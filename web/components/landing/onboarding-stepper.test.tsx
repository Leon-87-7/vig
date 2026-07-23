// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@/test/render';
import { describe, expect, it } from 'vitest';
import { OnboardingStepper } from './onboarding-stepper';

describe('OnboardingStepper', () => {
  it('exposes every step as a tab and shows the first panel', () => {
    render(<OnboardingStepper />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    const share = screen.getByRole('tabpanel', { name: /share it, keep scrolling/i });
    expect(share).toBeVisible();
    expect(within(share).getByRole('heading', { level: 3 })).toHaveTextContent(
      /share it, keep scrolling/i,
    );
  });

  it('activates a step when its tab is clicked, hiding the others', () => {
    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole('tab', { name: /ai pass/i }));

    expect(screen.getByRole('tab', { name: /ai pass/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Exactly one panel stays in the accessibility tree; the rest are hidden.
    const panels = screen.getAllByRole('tabpanel');
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveTextContent(/ownix does the reading/i);
  });

  it('walks forward with the Next control and reveals the invite hand-off on the last step', () => {
    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    expect(
      screen.getByRole('tabpanel', { name: /it lands in your index/i }),
    ).toBeVisible();
    const invite = screen.getByRole('link', { name: /get an invite/i });
    expect(invite).toHaveAttribute('href', '#invite');
    expect(screen.queryByRole('button', { name: /^next$/i })).not.toBeInTheDocument();
  });

  it('moves selection with the arrow keys (tablist pattern)', () => {
    render(<OnboardingStepper />);
    const first = screen.getByRole('tab', { name: /share/i });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(screen.getByRole('tab', { name: /ai pass/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

type TooltipContentProps = ComponentPropsWithoutRef<typeof RadixTooltip.Content>;

type TooltipProps = {
  children: ReactElement;
  content?: ReactNode;
  side?: TooltipContentProps['side'];
  align?: TooltipContentProps['align'];
  mono?: boolean;
};

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  mono = false,
}: TooltipProps) {
  if (content == null || content === false || content === '') return children;

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={`z-50 max-w-xs rounded-md border border-line bg-raised px-2 py-1 text-xs leading-snug text-ink shadow-overlay data-[state=closed]:animate-tooltip-out data-[state=delayed-open]:animate-tooltip-in data-[state=instant-open]:animate-tooltip-in motion-reduce:animate-none ${
            mono ? 'break-words font-mono [text-wrap:pretty]' : 'font-sans'
          }`}
        >
          {content}
          <RadixTooltip.Arrow className="fill-raised" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

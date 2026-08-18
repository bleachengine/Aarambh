'use client';

import { AarambhLogo } from '@/components/aarambh-logo';
import { ClockIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';

type AppHeaderAction = { type: 'history'; onClick: () => void; disabled?: boolean };

interface AppHeaderProps {
  action?: AppHeaderAction;
}

export function AppHeader({ action }: AppHeaderProps) {
  return (
    <header className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <AarambhLogo className="h-8 w-8 shrink-0" />
        <h1 className="text-2xl font-bold leading-none tracking-tight text-[#509fe7] sm:text-3xl">
          Aarambh
        </h1>
      </div>
      {action?.type === 'history' && (
        <Button variant="ghost" size="sm" onClick={action.onClick} disabled={action.disabled}>
          <ClockIcon className="mr-1.5 h-4 w-4" />
          History
        </Button>
      )}
    </header>
  );
}

export default AppHeader;

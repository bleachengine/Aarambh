'use client';

import { AarambhLogo } from '@/components/aarambh-logo';
import { ClockIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';

type AppHeaderAction = { type: 'history'; onClick: () => void; disabled?: boolean };

interface AppHeaderProps {
  action?: AppHeaderAction;
  username?: string | null;
}

export function AppHeader({ action, username }: AppHeaderProps) {
  return (
    <header className="mb-4 flex items-center justify-between gap-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <AarambhLogo className="h-8 w-8 shrink-0" />
        <h1 className="text-2xl font-bold leading-none tracking-tight text-[#509fe7] sm:text-3xl">
          Aarambh
        </h1>
      </div>
      {username && (
        <p className="hidden flex-1 text-center text-lg text-muted-foreground sm:block">
          Hi, good to see you <span className="font-semibold capitalize text-orange-500">{username}</span>
        </p>
      )}
      {action?.type === 'history' && (
        <Button variant="ghost" size="sm" onClick={action.onClick} disabled={action.disabled} className="shrink-0">
          <ClockIcon className="mr-1.5 h-4 w-4" />
          History
        </Button>
      )}
    </header>
  );
}

export default AppHeader;

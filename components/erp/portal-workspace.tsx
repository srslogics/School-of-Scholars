'use client';
import { useState } from 'react';
import type { Workspace } from '@/lib/erp/model';
import { appNavigation } from '@/lib/erp/navigation';
import { AppSidebar } from './sidebar';
import { PortalPanel, type ParentModule } from './portals';
import { AcademicPanel, type AcademicArea } from './academics';

export function PortalWorkspace({ workspace }: { workspace: Workspace }) {
  const parent = workspace.account.role === 'parent';
  const [selected, setSelected] = useState(
    parent ? 'daily:attendance' : 'daily:requests',
  );
  const groups = appNavigation(workspace.account.role);
  const label =
    groups.flatMap((group) => group.items).find((item) => item.id === selected)
      ?.label ?? 'Workspace';
  return (
    <div className="erp-layout">
      <AppSidebar groups={groups} selected={selected} onSelect={setSelected} />
      <div className="erp-main" id="school-content" tabIndex={-1}>
        <header className="erp-page-title">
          <p>{parent ? 'Parent' : 'Staff'} workspace</p>
          <h1>{label}</h1>
        </header>
        {selected.startsWith('academic:') ? (
          <AcademicPanel
            key={selected}
            embedded
            account={workspace.account}
            initialArea={selected.slice(9) as AcademicArea}
          />
        ) : (
          <PortalPanel
            account={workspace.account}
            date={workspace.date}
            module={parent ? (selected.slice(6) as ParentModule) : undefined}
            onModuleChange={(area) => setSelected('daily:' + area)}
            hideNavigation
            historyOnly={selected === 'daily:history'}
          />
        )}
      </div>
    </div>
  );
}

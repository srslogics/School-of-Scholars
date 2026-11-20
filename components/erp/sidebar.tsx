'use client';
import { useState } from 'react';
import { ChevronDown, Menu, GraduationCap } from 'lucide-react';
import type { NavigationGroup } from '@/lib/erp/navigation';

export function AppSidebar({
  groups,
  selected,
  onSelect,
}: {
  groups: NavigationGroup[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="erp-nav erp-grouped-sidebar" aria-label="App navigation">
      <button
        className="erp-mobile-nav-toggle"
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="school-sidebar-groups"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu size={17} aria-hidden="true" />
        Menu
      </button>
      <div
        id="school-sidebar-groups"
        className="erp-sidebar-groups"
        data-open={mobileOpen}
      >
        {groups.map((group) => (
          <details
            key={group.label}
            className="erp-sidebar-group"
            open={group.items.some((item) => item.id === selected)}
          >
            <summary>
              {group.label}
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="erp-sidebar-submenu">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected === item.id ? 'page' : undefined}
                  onClick={() => {
                    onSelect(item.id);
                    setMobileOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
      <div className="erp-nav-footer">
        <GraduationCap size={19} aria-hidden="true" />
        <strong>School of Scholars</strong>
        <small>Kolambi, Katol</small>
      </div>
    </nav>
  );
}

import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { NAV_ITEMS, SETTINGS_ITEM } from '@/nav';
import { useUiStore } from '@/store/uiStore';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

export function MoreSheet() {
  const open = useUiStore((s) => s.moreOpen);
  const setOpen = useUiStore((s) => s.setMoreOpen);
  const items = [...NAV_ITEMS.filter((i) => !['/', '/insights', '/planning'].includes(i.to)), SETTINGS_ITEM];
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="All sections">
      <ul className="-mx-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-2 py-3 hover:bg-page"
            >
              <IconTile icon={item.icon} accent="brand" size="sm" />
              <span className="flex-1 text-[14px] font-medium text-ink">{item.label}</span>
              <ChevronRight size={16} className="text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function QuickAddSheet() {
  const open = useUiStore((s) => s.quickAddOpen);
  const setOpen = useUiStore((s) => s.setQuickAddOpen);
  const navigate = useNavigate();
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  const actions = [
    { label: 'Expense', description: 'A bill, cost or subscription', icon: 'stat-cost' as const, accent: 'orange' as const, to: '/living?add=1' },
    { label: 'Income', description: 'Salary, freelance, benefits', icon: 'stat-income' as const, accent: 'green' as const, to: '/income?add=1' },
    { label: 'Savings goal', description: 'Something you are saving for', icon: 'nav-savings' as const, accent: 'purple' as const, to: '/savings?add=1' },
    { label: 'Account', description: 'A bank or investment account', icon: 'account-other' as const, accent: 'blue' as const, to: '/accounts?add=1' },
  ];
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="What would you like to add?" size="sm">
      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => go(a.to)}
            className="card flex flex-col items-start gap-2 p-4 text-left transition hover:border-line-strong"
          >
            <IconTile icon={a.icon} accent={a.accent} />
            <span className="text-[14px] font-semibold text-ink">{a.label}</span>
            <span className="text-[12px] text-muted">{a.description}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

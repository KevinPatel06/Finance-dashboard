import type { PaycheckWithAllocations } from '@shared/types';
import { fmtDate } from '@/lib/format';
import { useConfirm, useToast } from '@/lib/ui';
import { useApi, useRefresh } from '../data';
import { money } from '../format';
import { Group, NavHeader, Row } from '../ui/kit';

/** Every paycheck, newest first. Removing a check-in puts its payday back to "expected". */
export default function PayHistory() {
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const { data: checks } = useApi<PaycheckWithAllocations[]>(() => window.api.paychecks.list());

  if (!checks) return null;

  return (
    <div className="space-y-4">
      <NavHeader title="Pay history" subtitle={`${checks.length} paycheck${checks.length === 1 ? '' : 's'}`} />
      {checks.length === 0 ? (
        <p className="text-sm text-content-subtle text-center py-10">
          Paychecks you confirm on payday show up here.
        </p>
      ) : (
        <Group>
          {checks.map((p) => (
            <Row
              key={p.id}
              emoji="💵"
              color="#10b981"
              title={fmtDate(p.date, 'EEE, MMM d, yyyy')}
              subtitle={p.payday ? 'Payday check-in' : p.allocations.length ? 'Split with the paycheck wizard' : 'Logged'}
              value={money(p.amount)}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Remove this paycheck?',
                  description: p.payday
                    ? 'The payday goes back to "expected" and you can confirm it again.'
                    : 'Anything it paid toward (debts, goals) is undone too.',
                  confirmLabel: 'Remove',
                  destructive: true,
                });
                if (!ok) return;
                await window.api.paychecks.remove(p.id);
                toast.success('Paycheck removed.');
                bump();
              }}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

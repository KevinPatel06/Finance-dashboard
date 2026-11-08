import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Hourglass, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { RegisteredAccount } from '@shared/types';
import { taxYearFor } from '@shared/registered';
import { useConfirm, useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi, useMonth, useRefresh } from '../data';
import { friendlyDate, monthName, todayIso } from '../dates';
import { money, pct } from '../format';
import MoneySheet from '../ui/MoneySheet';
import Sheet from '../ui/Sheet';
import { Chip, CircleButton, EmojiAvatar, Group, HatchedBar, NavHeader, PCard, Row, SectionTitle } from '../ui/kit';
import AccountEditor from './AccountEditor';
import DepositSheet from './DepositSheet';
import { cash, KIND_META, monthShort, overRoom, shortDate } from './meta';

/**
 * One registered account (mockup 1, screen 4): the year's progress, this
 * month's plan, what went in each month (extra and short months adjust the
 * rest), every deposit, and past years.
 */
export default function AccountDetail() {
  const { id } = useParams();
  const accountId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const { data: accounts } = useApi<RegisteredAccount[]>(() => window.api.registered.list());
  const { data: v } = useMonth();
  const [sheet, setSheet] = useState<null | 'deposit' | 'edit' | 'newYear' | 'plan' | 'menu'>(null);

  if (!accounts || !v) return null;
  const a = accounts.find((x) => x.id === accountId);
  if (!a) return <NavHeader title="Account not found" />;

  const meta = KIND_META[a.kind];
  const label = a.label || meta.label;
  const month = todayIso().slice(0, 7);
  const confirmed = v.status === 'confirmed';
  const target = a.goal && a.goal > 0 ? a.goal : a.contribution_room;
  const toGo = Math.max(0, (a.goal ?? 0) - a.contributed);
  const over = a.waiting ? null : overRoom(a.kind, a.contribution_room, a.contributed);
  const nextYear = taxYearFor(a.kind, a.year_start);
  // Every deposit, all years — a mistyped date must still be findable and removable.
  const history = a.contributions;

  return (
    <div className="space-y-4">
      <NavHeader title={label} right={<CircleButton icon={MoreHorizontal} label="Options" onClick={() => setSheet('menu')} />} />

      <PCard className="p-5 text-center">
        <div className="flex justify-center mb-4">
          <EmojiAvatar emoji={meta.emoji} color={meta.color} size="xl" />
        </div>
        {a.waiting ? (
          <>
            <div className="text-[22px] font-display font-bold num">{cash(a.contributed)}</div>
            <div className="text-sm text-content-muted mt-1">in since {friendlyDate(a.year_start)}</div>
            <div className="mt-4 flex gap-2 items-start rounded-2xl bg-surface-3 px-3 py-2.5 text-left text-[13px] text-content-muted">
              <Hourglass size={16} className="shrink-0 mt-px" />
              {a.kind === 'rrsp'
                ? `Enter your ${nextYear} room from your Notice of Assessment to start budgeting. Deposits still count.`
                : `Your ${nextYear} year is ready to start. Deposits still count.`}
            </div>
          </>
        ) : (
          <>
            <div className="text-[22px] font-display font-bold num">
              {cash(a.contributed)}{' '}
              <span className="text-content-muted font-semibold">of {cash(target)}</span>
            </div>
            <div className="text-sm text-content-muted mt-1">
              {a.goal ? `${a.tax_year} goal · by ${shortDate(a.goal_deadline)}` : `${a.tax_year} room`}
            </div>
            <div className="mt-5 text-left">
              <HatchedBar pct={pct(a.contributed, target)} color={meta.color} badge={`${Math.floor(pct(a.contributed, target))}%`} />
              {a.goal ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="font-semibold">{toGo > 0 ? `${cash(toGo)} to go` : 'Goal met'}</span>
                  {toGo > 0 && a.months_left > 0 && (
                    <span className="text-content-muted">
                      {a.months_left} month{a.months_left === 1 ? '' : 's'} left
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-left">
              <div className="rounded-2xl bg-surface-3 px-3 py-2">
                <div className="text-xs text-content-muted">Room for {a.tax_year}</div>
                <div className="font-semibold num">{cash(a.contribution_room)}</div>
              </div>
              <div className="rounded-2xl bg-surface-3 px-3 py-2">
                <div className="text-xs text-content-muted">Room left</div>
                <div className="font-semibold num">{cash(Math.max(0, a.remaining))}</div>
              </div>
            </div>
            {over && (
              <p className="mt-3 text-xs font-medium text-warning text-left">
                {over}. CRA charges 1% a month on the excess.
              </p>
            )}
          </>
        )}
        <div className="flex justify-center gap-2 mt-5">
          <Chip active icon={Plus} onClick={() => setSheet('deposit')}>
            Log deposit
          </Chip>
          {a.waiting ? (
            <Chip onClick={() => setSheet('newYear')}>{a.kind === 'rrsp' ? 'Enter room' : `Start ${nextYear}`}</Chip>
          ) : (
            <Chip onClick={() => setSheet('edit')}>Edit</Chip>
          )}
        </div>
      </PCard>

      {a.this_month && (
        <Group>
          <Row
            emoji="🗓️"
            color={meta.color}
            title={`${monthName(month)} plan`}
            subtitle={confirmed ? 'In your budget' : 'Set when you confirm'}
            value={`${cash(a.this_month.deposited)} / ${cash(a.this_month.planned)}`}
            chevron={confirmed}
            onClick={confirmed ? () => setSheet('plan') : undefined}
          />
        </Group>
      )}

      {a.schedule.length > 0 && (
        <>
          <SectionTitle>By month</SectionTitle>
          <div className="rounded-[22px] bg-surface-2 border border-border/70 shadow-card divide-y divide-border/70 overflow-hidden">
            {a.schedule.map((r) => {
              const diff = r.planned != null ? Math.round((r.deposited - r.planned) * 100) / 100 : 0;
              return (
                <div
                  key={r.month}
                  className={cn('flex items-center gap-3 px-4 py-2.5', r.state === 'current' && 'bg-brand-soft/50')}
                >
                  <span className={cn('w-10 text-[13px]', r.state === 'future' ? 'text-content-subtle' : 'font-semibold')}>
                    {monthShort(r.month)}
                  </span>
                  <span className="flex-1 min-w-0 text-[14px] num">
                    {r.state === 'future' ? (
                      <span className="text-content-subtle">{cash(r.planned ?? 0)} planned</span>
                    ) : r.planned == null ? (
                      <>
                        {cash(r.deposited)} <span className="text-content-muted">deposited</span>
                      </>
                    ) : (
                      <>
                        {cash(r.deposited)} <span className="text-content-muted">of {cash(r.planned)}</span>
                      </>
                    )}
                    {r.state === 'current' && r.planned != null && r.planned > 0 && (
                      <span className="block mt-1">
                        <HatchedBar pct={pct(r.deposited, r.planned)} color={meta.color} height="sm" />
                      </span>
                    )}
                  </span>
                  {r.state === 'current' ? (
                    <span className="text-xs font-semibold text-brand">This month</span>
                  ) : r.state === 'past' && r.planned != null ? (
                    Math.abs(diff) < 1 ? (
                      <Check size={16} strokeWidth={2.6} className="text-brand" />
                    ) : diff > 0 ? (
                      <span className="rounded-md bg-brand-soft px-1.5 text-[11px] font-semibold text-brand">+{cash(diff)} extra</span>
                    ) : (
                      <span className="rounded-md bg-warning/15 px-1.5 text-[11px] font-semibold text-warning">{cash(-diff)} short</span>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-content-subtle px-1">
            Put in extra and the months ahead go down. Miss one and what's left spreads over the rest.
          </p>
        </>
      )}

      <SectionTitle>Contribution history</SectionTitle>
      {history.length === 0 ? (
        <p className="text-sm text-content-subtle px-1">No deposits yet.</p>
      ) : (
        <Group>
          {history.map((c) => (
            <Row
              key={c.id}
              title={c.note || 'Deposit'}
              subtitle={shortDate(c.date)}
              value={`+${money(c.amount)}`}
              valueTone="success"
              trailing={
                <button
                  aria-label="Remove"
                  className="p-1.5 -mr-1 text-content-subtle"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Remove this deposit?',
                      description: `${money(c.amount)} on ${friendlyDate(c.date)}. Months still to come will plan for it again.`,
                      confirmLabel: 'Remove',
                      destructive: true,
                    });
                    if (!ok) return;
                    await window.api.registered.removeContribution(c.id);
                    bump();
                  }}
                >
                  <Trash2 size={16} />
                </button>
              }
            />
          ))}
        </Group>
      )}

      {a.past_years.length > 0 && (
        <>
          <SectionTitle>Past years</SectionTitle>
          <Group>
            {a.past_years.map((y) => (
              <Row
                key={y.id}
                title={String(y.tax_year)}
                subtitle={y.goal ? `${cash(y.contributed)} of ${cash(y.goal)} goal` : 'No goal set'}
                value={cash(y.contributed)}
              />
            ))}
          </Group>
        </>
      )}

      {sheet === 'deposit' && <DepositSheet account={a} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && (
        <AccountEditor
          mode="edit"
          account={a}
          onClose={() => setSheet(null)}
          onSaved={() => setSheet(null)}
          onDeleted={() => navigate('/', { replace: true })}
        />
      )}
      {sheet === 'newYear' && (
        <AccountEditor mode="newYear" account={a} onClose={() => setSheet(null)} onSaved={() => setSheet(null)} />
      )}
      {sheet === 'plan' && a.this_month && (
        <MoneySheet
          title={`${monthName(month)} contribution`}
          subtitle={`How much of this month's budget goes to your ${label}.`}
          initial={a.this_month.planned}
          allowZero
          onClose={() => setSheet(null)}
          onSave={async (amount) => {
            await window.api.budget.setLine(month, 'contribution', a.id, amount);
            bump();
            setSheet(null);
          }}
        />
      )}

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={label}>
        <Group>
          {!a.waiting && (
            <Row title="Edit account" subtitle="Room, goal, deadline" chevron onClick={() => setSheet('edit')} />
          )}
          {!a.waiting && (
            <Row
              title={a.budgeted ? 'Stop budgeting monthly' : 'Budget it monthly'}
              subtitle={a.budgeted ? 'Keep tracking room and deposits only' : 'Split the goal across the months left'}
              onClick={async () => {
                setSheet(null);
                await window.api.registered.update(a.id, { budgeted: !a.budgeted });
                bump();
              }}
            />
          )}
          <Row
            title={<span className="text-danger">Delete account</span>}
            subtitle="Months you've already confirmed keep their numbers"
            onClick={async () => {
              setSheet(null);
              const ok = await confirm({
                title: `Delete your ${label}?`,
                description: "It's removed from Saving and from future budgets.",
                confirmLabel: 'Delete',
                destructive: true,
              });
              if (!ok) return;
              await window.api.registered.remove(a.id);
              toast.success(`${label} deleted.`);
              bump();
              navigate('/', { replace: true });
            }}
          />
        </Group>
      </Sheet>
    </div>
  );
}

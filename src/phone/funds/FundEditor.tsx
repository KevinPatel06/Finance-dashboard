import { useState } from 'react';
import type { SavingsGoal } from '@shared/types';
import { suggestEmoji } from '@shared/emoji';
import { GOAL_PALETTE } from '@/lib/palette';
import { cn } from '@/lib/utils';
import { useRefresh } from '../data';
import EmojiField from '../ui/EmojiField';
import Sheet from '../ui/Sheet';
import { BigButton, EmojiAvatar, MoneyInput, parseMoney } from '../ui/kit';

/** Create or edit a fund: name, emoji, target and an optional deadline. */
export default function FundEditor({
  fund,
  initialName,
  onClose,
  onSaved,
}: {
  fund?: SavingsGoal;
  initialName?: string;
  onClose: () => void;
  onSaved: (g: SavingsGoal) => void;
}) {
  const { bump } = useRefresh();
  const [name, setName] = useState(fund?.name ?? initialName ?? '');
  const [emoji, setEmoji] = useState(fund?.emoji ?? '');
  const [emojiTouched, setEmojiTouched] = useState(!!fund);
  const [target, setTarget] = useState(fund ? String(fund.target_amount) : '');
  const [date, setDate] = useState(fund?.target_date ?? '');
  const [color, setColor] = useState(fund?.color ?? GOAL_PALETTE[Math.floor(Math.random() * GOAL_PALETTE.length)]);
  const [busy, setBusy] = useState(false);

  const shownEmoji = emojiTouched ? emoji : suggestEmoji(name, '💰');
  const valid = name.trim().length > 0 && parseMoney(target) > 0;

  const save = async () => {
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        target_amount: parseMoney(target),
        target_date: date || null,
        color,
        emoji: shownEmoji,
      };
      const saved = (fund
        ? await window.api.goals.update(fund.id, input)
        : await window.api.goals.create(input)) as SavingsGoal;
      bump();
      onSaved(saved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={fund ? 'Edit fund' : 'New fund'}
      footer={
        <BigButton onClick={save} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </BigButton>
      }
    >
      <div className="flex justify-center py-3">
        <EmojiAvatar emoji={shownEmoji} color={color} size="xl" />
      </div>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input
            className="input text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
            maxLength={40}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Target</label>
            <MoneyInput value={target} onChange={setTarget} ariaLabel="Target amount" />
          </div>
          <div>
            <label className="label">By (optional)</label>
            <input type="date" className="input text-base" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Emoji</label>
          <EmojiField
            value={shownEmoji}
            onChange={(e) => {
              setEmoji(e);
              setEmojiTouched(true);
            }}
          />
        </div>
        <div>
          <label className="label">Colour</label>
          <div className="flex flex-wrap gap-2">
            {GOAL_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className={cn('w-9 h-9 rounded-full transition', color === c && 'ring-2 ring-offset-2 ring-content ring-offset-surface')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

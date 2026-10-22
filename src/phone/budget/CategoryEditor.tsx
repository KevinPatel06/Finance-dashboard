import { useState } from 'react';
import type { CategoryKind, ExpenseCategory } from '@shared/types';
import { suggestEmoji, suggestKind } from '@shared/emoji';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { GOAL_PALETTE } from '@/lib/palette';
import { useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import EmojiField from '../ui/EmojiField';
import Sheet from '../ui/Sheet';
import { BigButton, EmojiAvatar } from '../ui/kit';

/** Create or edit a spending category: name, emoji, colour, Need or Want. */
export default function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category?: ExpenseCategory;
  onClose: () => void;
  onSaved: (c: ExpenseCategory) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '');
  const [emojiTouched, setEmojiTouched] = useState(!!category);
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? 'want');
  const [kindTouched, setKindTouched] = useState(!!category);
  const [color, setColor] = useState(category?.color ?? GOAL_PALETTE[Math.floor(Math.random() * GOAL_PALETTE.length)]);
  const [busy, setBusy] = useState(false);

  const shownEmoji = emojiTouched ? emoji : suggestEmoji(name);
  const shownKind = kindTouched ? kind : suggestKind(name);

  const save = async () => {
    setBusy(true);
    try {
      const input = { name: name.trim(), color, emoji: shownEmoji, kind: shownKind };
      const saved = (category
        ? await window.api.expenseCategories.update(category.id, input)
        : await window.api.expenseCategories.create(input)) as ExpenseCategory;
      onSaved(saved);
    } catch {
      toast.error('A category with that name already exists.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <BigButton onClick={save} disabled={!name.trim() || busy}>
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
            placeholder="e.g. Eating out"
            maxLength={40}
          />
        </div>
        <div>
          <label className="label">Type</label>
          <SegmentedControl
            value={shownKind}
            onChange={(k) => {
              setKind(k);
              setKindTouched(true);
            }}
            options={[
              { value: 'need', label: 'Need' },
              { value: 'want', label: 'Want' },
            ]}
          />
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

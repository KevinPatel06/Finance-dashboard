import { useEffect, useState } from 'react';
import { Download, Upload, Sun, Moon, CalendarClock, Check, User } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { ACCENT_LABELS, ACCENT_SWATCH } from '@/lib/accents';
import { useConfirm, useToast } from '@/lib/ui';
import type { AccentColor, AppSettings } from '@shared/types';

export default function Settings() {
  const { theme, setTheme, accent, setAccent, userName, setUserName } = useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [nextDate, setNextDate] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    window.api.settings.get().then((s) => {
      setSettings(s as AppSettings);
      setNextDate((s as AppSettings).next_paycheck_date ?? '');
    });
  }, []);

  useEffect(() => {
    setNameInput(userName);
  }, [userName]);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setUserName(trimmed);
    setNameSavedAt(Date.now());
    window.setTimeout(() => setNameSavedAt(null), 1800);
  };

  const saveNextDate = async () => {
    await window.api.settings.update({ next_paycheck_date: nextDate || null });
    const s = (await window.api.settings.get()) as AppSettings;
    setSettings(s);
    toast.success('Pay schedule updated.');
  };

  const backup = async () => {
    const res = (await window.api.db.backup()) as { ok: boolean; path?: string };
    if (res.ok) toast.success('Database backed up successfully.');
  };

  const restore = async () => {
    const ok = await confirm({
      title: 'Restore from a backup?',
      description:
        'This replaces all of your current data with the contents of the backup file, then restarts the app. This cannot be undone.',
      confirmLabel: 'Restore & restart',
      destructive: true,
    });
    if (!ok) return;
    await window.api.db.restore();
  };

  if (!settings) return null;

  const accents = Object.keys(ACCENT_LABELS) as AccentColor[];

  const nameDirty = nameInput.trim() !== userName.trim() && nameInput.trim().length > 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Your profile</h2>
        <p className="text-sm text-content-muted mb-4">
          Your name shows in the sidebar header and the window title
          ("Kevin's Finance" → "Shiromi's Finance"). Change it any time.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Name</label>
            <input
              type="text"
              className="input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDirty) saveName();
              }}
              placeholder="Your name"
              maxLength={40}
            />
          </div>
          <button
            onClick={saveName}
            disabled={!nameDirty}
            className="btn-primary"
          >
            {nameSavedAt ? (
              <>
                <Check size={16} /> Saved
              </>
            ) : (
              <>
                <User size={16} /> Save
              </>
            )}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-1">Appearance</h2>
        <p className="text-sm text-content-muted mb-4">
          The toggle in the top right also switches themes.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ThemeOption
            active={theme === 'light'}
            onClick={() => setTheme('light')}
            icon={<Sun size={18} />}
            label="Light"
          />
          <ThemeOption
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
            icon={<Moon size={18} />}
            label="Dark"
          />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-1">Accent color</h2>
        <p className="text-sm text-content-muted mb-4">
          Used for buttons, links, the wizard stepper, and goal progress accents. Each color
          adapts automatically to light and dark mode.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {accents.map((a) => (
            <AccentOption
              key={a}
              color={a}
              active={accent === a}
              onClick={() => setAccent(a)}
            />
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-1">Pay schedule</h2>
        <p className="text-sm text-content-muted mb-4">
          Bi-weekly cadence — set the next expected paycheck date for accurate countdowns.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Next paycheck</label>
            <input
              type="date"
              className="input"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
          <button onClick={saveNextDate} className="btn-primary">
            <CalendarClock size={16} /> Save
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-1">Data</h2>
        <p className="text-sm text-content-muted mb-4">
          Back up your finance database to a file, or restore from a previous backup. The database
          is stored locally on this machine.
        </p>
        <div className="flex gap-2">
          <button onClick={backup} className="btn-outline">
            <Download size={16} /> Back up database
          </button>
          <button onClick={restore} className="btn-outline">
            <Upload size={16} /> Restore from backup
          </button>
        </div>
      </div>
    </div>
  );
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 flex items-center gap-3 transition text-left ${
        active
          ? 'border-brand bg-brand-soft text-brand'
          : 'border-border bg-surface-3 text-content hover:bg-surface-3/70'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-lg grid place-items-center ${
          active ? 'bg-brand text-white dark:text-slate-900' : 'bg-surface-2 text-content-muted'
        }`}
      >
        {icon}
      </div>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-content-muted">{active ? 'Currently active' : 'Select'}</div>
      </div>
    </button>
  );
}

function AccentOption({
  color,
  active,
  onClick,
}: {
  color: AccentColor;
  active: boolean;
  onClick: () => void;
}) {
  const swatch = ACCENT_SWATCH[color];
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border p-3 flex items-center gap-3 transition text-left ${
        active
          ? 'border-content/30 bg-surface-3'
          : 'border-border bg-surface-3 hover:bg-surface-3/70'
      }`}
    >
      <div
        className="w-9 h-9 rounded-lg shadow-soft grid place-items-center text-white"
        style={{ backgroundColor: swatch }}
      >
        {active && <Check size={16} strokeWidth={3} />}
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm">{ACCENT_LABELS[color]}</div>
        <div className="text-xs text-content-muted">{active ? 'Active' : 'Click to use'}</div>
      </div>
    </button>
  );
}

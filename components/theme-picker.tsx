'use client';
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
const subscribe = () => () => {};
export function ThemePicker() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  return <label className="theme-picker">Appearance
    <select aria-label="Appearance" value={mounted ? theme : 'system'} disabled={!mounted} onChange={event => setTheme(event.target.value)}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>;
}

import { Bot, Download, KeyRound, MessageSquare, Palette, Shapes, Tags, UserRound, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';

const icons = { assistant: Bot, export: Download, keys: KeyRound, sms: MessageSquare, appearance: Palette, categories: Shapes, tags: Tags, profile: UserRound, accounts: WalletCards };

export function SettingsHeading({ icon, title, description, id, badge }: {
  icon: keyof typeof icons;
  title: string;
  description: ReactNode;
  id?: string;
  badge?: string;
}) {
  const Icon = icons[icon];
  return <header className="settings-card-heading">
    <span className="settings-icon"><Icon size={20} aria-hidden="true" /></span>
    <div><div className="settings-title-row"><h2 id={id}>{title}</h2>{badge && <span className="settings-badge">{badge}</span>}</div><p className="muted">{description}</p></div>
  </header>;
}

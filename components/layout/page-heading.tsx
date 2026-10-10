import type { ReactNode } from 'react';

export function PageHeading({ title, description, action, eyebrow }: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </header>
  );
}

import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import clsx from "clsx";
import type { Icon } from "@phosphor-icons/react";

interface PageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: Icon;
  actions?: React.ReactNode;
  compact?: boolean;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: HeaderIcon,
  actions,
  compact = false,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className={clsx("ui-page-header", compact && "is-compact")}>
      <div className="ui-page-header__copy">
        {HeaderIcon ? (
          <span className="ui-page-header__icon" aria-hidden>
            <HeaderIcon size={23} weight="duotone" />
          </span>
        ) : null}
        <div>
          <p className="ui-page-header__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {description ? <p className="ui-page-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}

interface SurfaceCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  children: React.ReactNode;
  as?: "article" | "section" | "div";
  interactive?: boolean;
}

export function SurfaceCard({
  children,
  as: Component = "article",
  interactive = false,
  className,
  ...props
}: SurfaceCardProps): React.JSX.Element {
  return (
    <Component
      className={clsx("ui-card", interactive && "ui-card--interactive", className)}
      {...props}
    >
      {children}
    </Component>
  );
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  context: React.ReactNode;
  accent?: "teal" | "blue" | "amber" | "neutral";
}

export function MetricCard({
  label,
  value,
  context,
  accent = "neutral",
}: MetricCardProps): React.JSX.Element {
  return (
    <article className="ui-metric-card" data-accent={accent}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{context}</small>
    </article>
  );
}

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: EmptyIcon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="ui-empty-state" role="status">
      <span className="ui-empty-state__icon" aria-hidden>
        <EmptyIcon size={22} weight="duotone" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="ui-button ui-button--secondary" onClick={onAction}>
          {actionLabel}
          <ArrowRightIcon size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

interface DialogShellProps {
  titleId: string;
  descriptionId?: string;
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

export function DialogShell({
  titleId,
  descriptionId,
  eyebrow,
  title,
  description,
  children,
}: DialogShellProps): React.JSX.Element {
  return (
    <div className="ui-dialog-shell">
      <header className="ui-dialog-shell__header">
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h2 id={titleId}>{title}</h2>
        {description ? <span id={descriptionId}>{description}</span> : null}
      </header>
      {children}
    </div>
  );
}

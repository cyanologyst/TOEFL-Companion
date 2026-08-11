import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import * as Accordion from "@radix-ui/react-accordion";
import * as Progress from "@radix-ui/react-progress";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { useId, useRef } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { DoodleIcon, type DoodleIconName } from "./DoodleIcon";
import { Icon8, illustrationFor } from "./Icon8";
import { Modal } from "./Modal";

type StudyIcon = DoodleIconName | ReactNode;

function IconSlot({
  icon,
  className,
  size = 22,
}: {
  icon: StudyIcon;
  className?: string;
  size?: number;
}): React.JSX.Element {
  if (typeof icon === "string") {
    return <DoodleIcon name={icon as DoodleIconName} size={size} className={className} />;
  }
  return (
    <span className={className} aria-hidden>
      {icon}
    </span>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  icon?: StudyIcon;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
  headingId?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  icon,
  actions,
  compact = false,
  className,
  headingId,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className={clsx("study-page-header", compact && "is-compact", className)}>
      <div className="study-page-header__copy">
        {icon ? <IconSlot icon={icon} className="study-page-header__icon" size={26} /> : null}
        <div className="study-page-header__text">
          {eyebrow ? <p className="study-page-header__eyebrow">{eyebrow}</p> : null}
          <h1 id={headingId}>{title}</h1>
          {description ? <p className="study-page-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="study-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export interface SegmentedControlItem<Value extends string = string> {
  value: Value;
  label: ReactNode;
  icon?: StudyIcon;
  disabled?: boolean;
  panel?: ReactNode;
  tabId?: string;
  panelId?: string;
}

export interface SegmentedControlProps<Value extends string = string> {
  label: string;
  items: readonly SegmentedControlItem<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  id?: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
}

function segmentIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function getSegmentedControlIds(
  controlId: string,
  value: string,
): { tabId: string; panelId: string } {
  const part = segmentIdPart(value);
  return {
    tabId: `${controlId}-tab-${part}`,
    panelId: `${controlId}-panel-${part}`,
  };
}

export function SegmentedControl<Value extends string = string>({
  label,
  items,
  value,
  onValueChange,
  id,
  className,
  orientation = "horizontal",
}: SegmentedControlProps<Value>): React.JSX.Element {
  const generatedId = useId().replace(/:/g, "");
  const controlId = id ?? `study-segments-${generatedId}`;
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasPanels = items.some((item) => item.panel !== undefined);

  const focusAndSelect = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) {
      return;
    }
    buttonRefs.current[index]?.focus();
    onValueChange(item.value);
  };

  const findNextEnabled = (currentIndex: number, direction: 1 | -1): number => {
    for (let offset = 1; offset <= items.length; offset += 1) {
      const index = (currentIndex + direction * offset + items.length) % items.length;
      if (!items[index]?.disabled) {
        return index;
      }
    }
    return currentIndex;
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    let nextIndex: number | undefined;
    if (event.key === nextKey) {
      nextIndex = findNextEnabled(index, 1);
    } else if (event.key === previousKey) {
      nextIndex = findNextEnabled(index, -1);
    } else if (event.key === "Home") {
      nextIndex = items.findIndex((item) => !item.disabled);
    } else if (event.key === "End") {
      for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        if (!items[itemIndex]?.disabled) {
          nextIndex = itemIndex;
          break;
        }
      }
    }
    if (nextIndex !== undefined && nextIndex >= 0) {
      event.preventDefault();
      focusAndSelect(nextIndex);
    }
  };

  return (
    <div className={clsx("study-segmented-control", className)} data-orientation={orientation}>
      <div
        className="study-segmented-control__list"
        role="tablist"
        aria-label={label}
        aria-orientation={orientation}
      >
        {items.map((item, index) => {
          const ids = getSegmentedControlIds(controlId, item.value);
          const selected = value === item.value;
          return (
            <button
              key={item.value}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              id={item.tabId ?? ids.tabId}
              type="button"
              role="tab"
              className="study-segmented-control__tab"
              aria-selected={selected}
              aria-controls={item.panelId ?? ids.panelId}
              aria-disabled={item.disabled || undefined}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              data-state={selected ? "active" : "inactive"}
              onClick={() => onValueChange(item.value)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {item.icon ? (
                <IconSlot icon={item.icon} className="study-segmented-control__icon" size={19} />
              ) : null}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {hasPanels
        ? items.map((item) => {
            const ids = getSegmentedControlIds(controlId, item.value);
            return (
              <section
                key={item.value}
                id={item.panelId ?? ids.panelId}
                className="study-segmented-control__panel"
                role="tabpanel"
                aria-labelledby={item.tabId ?? ids.tabId}
                hidden={value !== item.value}
              >
                {item.panel}
              </section>
            );
          })
        : null}
    </div>
  );
}

export interface TooltipProviderProps {
  children: ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}

export function TooltipProvider({
  children,
  delayDuration = 400,
  skipDelayDuration = 150,
}: TooltipProviderProps): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
}

export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  delayDuration,
}: TooltipProps): React.JSX.Element {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="study-tooltip"
          side={side}
          align={align}
          sideOffset={7}
        >
          {content}
          <TooltipPrimitive.Arrow className="study-tooltip__arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "vocabulary"
  | "speaking"
  | "writing";

export interface StatusBadgeProps {
  children?: ReactNode;
  label?: ReactNode;
  tone?: StatusTone;
  icon?: StudyIcon;
  className?: string;
  live?: boolean;
}

export function StatusBadge({
  children,
  label,
  tone = "neutral",
  icon,
  className,
  live = false,
}: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={clsx("study-status-badge", className)}
      data-tone={tone}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      {icon ? <IconSlot icon={icon} className="study-status-badge__icon" size={16} /> : null}
      <span>{label ?? children}</span>
    </span>
  );
}

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: ReactNode;
  ariaLabel?: string;
  showValue?: boolean;
  valueFormatter?: (value: number, max: number) => string;
  tone?: "primary" | "vocabulary" | "speaking" | "writing";
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  ariaLabel,
  showValue = false,
  valueFormatter = (current, maximum) => `${Math.round((current / maximum) * 100)}%`,
  tone = "primary",
  className,
}: ProgressBarProps): React.JSX.Element {
  const labelId = useId();
  const safeMax = max > 0 ? max : 100;
  const safeValue = Math.min(Math.max(value, 0), safeMax);
  const percentage = (safeValue / safeMax) * 100;
  const valueLabel = valueFormatter(safeValue, safeMax);
  return (
    <div className={clsx("study-progress", className)} data-tone={tone}>
      {label || showValue ? (
        <div className="study-progress__meta">
          {label ? <span id={labelId}>{label}</span> : <span />}
          {showValue ? <strong>{valueLabel}</strong> : null}
        </div>
      ) : null}
      <Progress.Root
        className="study-progress__track"
        value={safeValue}
        max={safeMax}
        getValueLabel={() => valueLabel}
        aria-label={!label ? (ariaLabel ?? "Progress") : undefined}
        aria-labelledby={label ? labelId : undefined}
      >
        <Progress.Indicator
          className="study-progress__indicator"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </Progress.Root>
    </div>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  description: ReactNode;
  icon?: StudyIcon;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = "bulb",
  action,
  compact = false,
  className,
}: EmptyStateProps): React.JSX.Element {
  const titleId = useId();
  // An empty screen is the one place a full drawing earns its size; fall back
  // to the flat glyph when no illustration matches the meaning.
  const illustration = typeof icon === "string" ? illustrationFor(icon) : null;
  return (
    <section
      className={clsx("study-empty-state", compact && "is-compact", className)}
      aria-labelledby={titleId}
    >
      {illustration ? (
        <Icon8 name={illustration} size={compact ? 34 : 48} className="study-empty-state__art" />
      ) : (
        <IconSlot icon={icon} className="study-empty-state__icon" size={28} />
      )}
      <div className="study-empty-state__copy">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="study-empty-state__action">{action}</div> : null}
    </section>
  );
}

export type AsyncState = "idle" | "loading" | "success" | "error";

export interface AsyncStatusProps {
  status: AsyncState;
  message?: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

const asyncDefaults: Record<Exclude<AsyncState, "idle">, string> = {
  loading: "Working…",
  success: "Saved successfully.",
  error: "Something went wrong. Your work is still on this device.",
};

export function AsyncStatus({
  status,
  message,
  detail,
  onRetry,
  retryLabel = "Try again",
  className,
}: AsyncStatusProps): React.JSX.Element | null {
  if (status === "idle" && !message) {
    return null;
  }
  const Icon =
    status === "loading"
      ? SpinnerGapIcon
      : status === "success"
        ? CheckCircleIcon
        : status === "error"
          ? WarningCircleIcon
          : InfoIcon;
  return (
    <div
      className={clsx("study-async-status", className)}
      data-state={status}
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      aria-busy={status === "loading" || undefined}
    >
      <Icon
        className={clsx(status === "loading" && "is-spinning")}
        size={19}
        weight={status === "success" ? "fill" : "regular"}
        aria-hidden
      />
      <div className="study-async-status__copy">
        <strong>{message ?? (status === "idle" ? "Ready." : asyncDefaults[status])}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
      {status === "error" && onRetry ? (
        <button type="button" className="button button--quiet" onClick={onRetry}>
          <ArrowClockwiseIcon size={17} aria-hidden />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      initialFocusRef={cancelRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="b-btn"
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={clsx("b-btn", tone === "danger" ? "b-btn--flame" : "b-btn--lime")}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <SpinnerGapIcon className="is-spinning" size={17} aria-hidden /> : null}
            {pending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {children ? (
        <div className="study-confirm-dialog" aria-busy={pending || undefined}>
          {children}
        </div>
      ) : null}
    </Modal>
  );
}

export interface StudyAccordionItem {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  content: ReactNode;
  icon?: StudyIcon;
  disabled?: boolean;
}

interface StudyAccordionCommonProps {
  items: readonly StudyAccordionItem[];
  className?: string;
}

interface StudyAccordionSingleProps extends StudyAccordionCommonProps {
  type?: "single";
  collapsible?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

interface StudyAccordionMultipleProps extends StudyAccordionCommonProps {
  type: "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export type StudyAccordionProps = StudyAccordionSingleProps | StudyAccordionMultipleProps;

function AccordionSections({ items }: { items: readonly StudyAccordionItem[] }): React.JSX.Element {
  return (
    <>
      {items.map((item) => (
        <Accordion.Item
          key={item.value}
          className="study-accordion__item"
          value={item.value}
          disabled={item.disabled}
        >
          <Accordion.Header className="study-accordion__header">
            <Accordion.Trigger className="study-accordion__trigger">
              {item.icon ? (
                <IconSlot icon={item.icon} className="study-accordion__icon" size={20} />
              ) : null}
              <span className="study-accordion__heading">
                <strong>{item.title}</strong>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              <CaretDownIcon className="study-accordion__chevron" size={18} aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="study-accordion__content">
            <div className="study-accordion__content-inner">{item.content}</div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </>
  );
}

export function StudyAccordion(props: StudyAccordionProps): React.JSX.Element {
  if (props.type === "multiple") {
    return (
      <Accordion.Root
        type="multiple"
        className={clsx("study-accordion", props.className)}
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={props.onValueChange}
      >
        <AccordionSections items={props.items} />
      </Accordion.Root>
    );
  }
  return (
    <Accordion.Root
      type="single"
      className={clsx("study-accordion", props.className)}
      collapsible={props.collapsible ?? true}
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={props.onValueChange}
    >
      <AccordionSections items={props.items} />
    </Accordion.Root>
  );
}

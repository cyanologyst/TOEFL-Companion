import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { ChartBarIcon } from "@phosphor-icons/react/ChartBar";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { DotsThreeCircleIcon } from "@phosphor-icons/react/DotsThreeCircle";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { HouseIcon } from "@phosphor-icons/react/House";
import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { QuestionIcon } from "@phosphor-icons/react/Question";
import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useRef, useState } from "react";
import type { WorkspaceArea } from "../types/toefl";

interface UtilityRailProps {
  activeArea: WorkspaceArea;
  onSelect: (area: WorkspaceArea) => void;
}

interface RailItem {
  area: WorkspaceArea;
  label: string;
  Icon: typeof HouseIcon;
}

const primaryItems = [
  { area: "home", label: "Home", Icon: HouseIcon },
  { area: "practice", label: "Speaking", Icon: MicrophoneIcon },
  { area: "vocabulary", label: "Vocabulary", Icon: BrainIcon },
  { area: "progress", label: "Progress", Icon: ChartBarIcon },
  { area: "saved", label: "Saved", Icon: BookmarkSimpleIcon },
  {
    area: "history",
    label: "History",
    Icon: ClockCounterClockwiseIcon,
  },
] as const;

const secondaryItems = [
  { area: "settings", label: "Settings", Icon: GearSixIcon },
  { area: "help", label: "Help", Icon: QuestionIcon },
] as const;

const mobileItems = primaryItems.filter(({ area }) => area !== "home" && area !== "history");
const moreItems = [
  { area: "home", label: "Home", Icon: HouseIcon },
  {
    area: "history",
    label: "Speaking history",
    Icon: ClockCounterClockwiseIcon,
  },
  ...secondaryItems,
] as const;

function RailButton({
  area,
  label,
  Icon,
  activeArea,
  onSelect,
}: RailItem & UtilityRailProps): React.JSX.Element {
  const isActive = activeArea === area;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="rail-button"
          data-active={isActive}
          aria-current={isActive ? "page" : undefined}
          onClick={() => onSelect(area)}
        >
          <Icon size={29} weight={isActive ? "duotone" : "regular"} aria-hidden />
          <span>{label}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="right" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function UtilityRail({ activeArea, onSelect }: UtilityRailProps): React.JSX.Element {
  return (
    <aside className="utility-rail" aria-label="Application">
      <nav className="rail-primary" aria-label="Main navigation">
        {primaryItems.map((item) => (
          <RailButton key={item.area} {...item} activeArea={activeArea} onSelect={onSelect} />
        ))}
      </nav>
      <nav className="rail-secondary" aria-label="Support navigation">
        {secondaryItems.map((item) => (
          <RailButton key={item.area} {...item} activeArea={activeArea} onSelect={onSelect} />
        ))}
      </nav>
    </aside>
  );
}

export function MobileNavigation({ activeArea, onSelect }: UtilityRailProps): React.JSX.Element {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreActive = moreItems.some(({ area }) => area === activeArea);

  const chooseMoreItem = (area: WorkspaceArea) => {
    setMoreOpen(false);
    onSelect(area);
  };

  return (
    <>
      <nav className="mobile-navigation" aria-label="Application">
        {mobileItems.map(({ area, label, Icon }) => {
          const isActive = activeArea === area;
          return (
            <button
              type="button"
              key={area}
              className="mobile-nav-button"
              data-active={isActive}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(area)}
            >
              <Icon size={23} weight={isActive ? "duotone" : "regular"} aria-hidden />
              <span>{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="mobile-nav-button"
          data-active={moreActive}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
          ref={moreTriggerRef}
        >
          <DotsThreeCircleIcon size={23} weight={moreActive ? "duotone" : "regular"} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="more-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => moreTriggerRef.current?.focus());
            }}
          >
            <div className="more-dialog-header">
              <div>
                <Dialog.Title>More</Dialog.Title>
                <Dialog.Description>Open your workspace and support pages.</Dialog.Description>
              </div>
              <Dialog.Close className="icon-button" aria-label="Close menu">
                <XIcon size={21} aria-hidden />
              </Dialog.Close>
            </div>
            <nav className="more-dialog-list" aria-label="More destinations">
              {moreItems.map(({ area, label, Icon }) => {
                const isActive = activeArea === area;
                return (
                  <button
                    type="button"
                    className="more-dialog-item"
                    data-active={isActive}
                    aria-current={isActive ? "page" : undefined}
                    key={area}
                    onClick={() => chooseMoreItem(area)}
                  >
                    <Icon size={23} weight={isActive ? "duotone" : "regular"} aria-hidden />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

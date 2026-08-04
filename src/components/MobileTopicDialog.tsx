import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";
import type { Topic } from "../types/toefl";
import { TopicNavigator } from "./TopicNavigator";

interface MobileTopicDialogProps {
  open: boolean;
  topics: Topic[];
  activeTopicId: number;
  collapsedCategories: Set<string>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onToggleCategory: (category: string) => void;
  onSelectTopic: (topicId: number) => void;
}

export function MobileTopicDialog({
  open,
  topics,
  activeTopicId,
  collapsedCategories,
  returnFocusRef,
  onOpenChange,
  onToggleCategory,
  onSelectTopic,
}: MobileTopicDialogProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="topic-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => {
              if (returnFocusRef?.current?.isConnected) {
                returnFocusRef.current.focus();
              }
            });
          }}
        >
          <div className="topic-dialog-header">
            <div>
              <Dialog.Title>Practice topics</Dialog.Title>
              <Dialog.Description>Choose one of 30 TOEFL speaking topics.</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close topics">
              <XIcon size={21} aria-hidden />
            </Dialog.Close>
          </div>
          <TopicNavigator
            embedded
            topics={topics}
            activeTopicId={activeTopicId}
            collapsedCategories={collapsedCategories}
            onToggleCategory={onToggleCategory}
            onSelectTopic={(topicId) => {
              onSelectTopic(topicId);
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

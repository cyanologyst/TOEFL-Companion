import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  initialFocusRef,
}: ModalProps): React.JSX.Element {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content
            className="modal-card"
            onOpenAutoFocus={(event) => {
              if (initialFocusRef?.current) {
                event.preventDefault();
                initialFocusRef.current.focus();
              }
            }}
          >
            <header className="modal-card__header">
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description className={description ? undefined : "sr-only"}>
                  {description ?? `${title} dialog.`}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close dialog">
                  <XIcon size={19} aria-hidden />
                </button>
              </Dialog.Close>
            </header>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

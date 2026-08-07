import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** `wide` is for dialogs carrying a two-column form or a preview table. */
  size?: "default" | "wide";
  /** Actions pinned below the scrolling body, so a long form never pushes the
   *  confirm button out of reach. */
  footer?: React.ReactNode;
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  initialFocusRef,
  size = "default",
  footer,
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
        {/* The portal escapes the page root, so the dialog carries the world's
            tokens itself rather than inheriting them. */}
        <Dialog.Overlay className="b-portal b-modal__scrim">
          <Dialog.Content
            className={`b-modal b-stamp${size === "wide" ? " b-modal--wide" : ""}`}
            onOpenAutoFocus={(event) => {
              if (initialFocusRef?.current) {
                event.preventDefault();
                initialFocusRef.current.focus();
              }
            }}
          >
            <header className="b-modal__head">
              <div>
                <Dialog.Title asChild>
                  <h2>{title}</h2>
                </Dialog.Title>
                <Dialog.Description className={description ? undefined : "sr-only"}>
                  {description ?? `${title} dialog.`}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="b-icon-btn" aria-label="Close dialog">
                  <XIcon size={19} aria-hidden />
                </button>
              </Dialog.Close>
            </header>
            {/* Everything a caller passes gets the frame's inset here, so no
                call site can end up flush against the border. */}
            {children ? <div className="b-modal__body">{children}</div> : null}
            {footer ? <footer className="b-modal__foot">{footer}</footer> : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

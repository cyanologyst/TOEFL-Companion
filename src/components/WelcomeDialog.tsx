import { useId, useRef, useState } from "react";
import { Modal } from "./Modal";

interface WelcomeDialogProps {
  open: boolean;
  onSubmit: (name: string) => void;
  /** Closing without answering only stands down for this session; the app asks
   *  again next launch rather than settling on a name nobody chose. */
  onDismiss: () => void;
}

export function WelcomeDialog({
  open,
  onSubmit,
  onDismiss,
}: WelcomeDialogProps): React.JSX.Element {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const trimmed = name.trim();

  return (
    <Modal
      open={open}
      title="Welcome to TOEFL Companion"
      description="One thing before you start."
      onClose={onDismiss}
      initialFocusRef={inputRef}
      footer={
        <button type="submit" form={formId} className="b-btn b-btn--lime" disabled={!trimmed}>
          Start studying
        </button>
      }
    >
      <form
        id={formId}
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) {
            onSubmit(trimmed);
          }
        }}
      >
        <p>
          Your name greets you on the dashboard and nowhere else. It stays on this computer, and you
          can change it any time in Settings.
        </p>
        <label>
          What should the app call you?
          <input
            ref={inputRef}
            required
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your first name"
          />
        </label>
      </form>
    </Modal>
  );
}

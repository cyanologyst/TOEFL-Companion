import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { ChatTextIcon } from "@phosphor-icons/react/ChatText";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { XIcon } from "@phosphor-icons/react/X";
import * as Accordion from "@radix-ui/react-accordion";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import { getAnswerPlanSteps } from "../lib/question";
import type { Question, SavedRecordingMetadata } from "../types/toefl";
import { RecorderPanel } from "./RecorderPanel";

interface PreparationPanelProps {
  questionKey: string;
  question: Question;
  onNotice: (message: string) => void;
  onRecordingSave: (result: SavedRecordingMetadata) => void;
  open?: boolean;
  drawer?: boolean;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
}

function AccordionChevron(): React.JSX.Element {
  return <CaretDownIcon className="accordion-chevron" size={18} weight="bold" aria-hidden />;
}

export function PreparationPanel({
  questionKey,
  question,
  onNotice,
  onRecordingSave,
  open = true,
  drawer = false,
  returnFocusRef,
  onClose = () => undefined,
}: PreparationPanelProps): React.JSX.Element {
  const [answerIndex, setAnswerIndex] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);
  const planSteps = getAnswerPlanSteps(question);

  const answers = [
    { id: "primary", text: question.answer },
    { id: "secondary", text: question.answer2 },
  ];
  const selectAnswerTab = (index: number) => {
    setAnswerIndex(index);
    window.requestAnimationFrame(() => {
      document.getElementById(`answer-tab-${questionKey}-${index}`)?.focus();
    });
  };

  useEffect(() => {
    if (drawer && open) {
      closeButtonRef.current?.focus();
    } else if (drawer && wasOpenRef.current && !open) {
      returnFocusRef?.current?.focus();
    }
    wasOpenRef.current = open;
  }, [drawer, open, returnFocusRef]);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!drawer || !open) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), audio[controls], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {drawer && open ? (
        <div className="preparation-drawer-overlay" aria-hidden onMouseDown={onClose} />
      ) : null}
      <aside
        className="preparation-panel"
        id="response-preparation-panel"
        aria-label="Response preparation"
        aria-hidden={!open}
        data-drawer={drawer}
        data-open={open}
        role={drawer ? "dialog" : undefined}
        onKeyDown={handlePanelKeyDown}
        ref={panelRef}
      >
        <div className="preparation-scroll-region">
          <Accordion.Root className="preparation-accordion" type="multiple" defaultValue={["plan"]}>
            <Accordion.Item className="preparation-section" value="plan">
              <Accordion.Header asChild>
                <h2 className="preparation-heading preparation-heading--panel">
                  <Accordion.Trigger className="preparation-trigger">
                    <span>Answer plan</span>
                    <AccordionChevron />
                  </Accordion.Trigger>
                  <button
                    type="button"
                    className="preparation-panel-close"
                    onClick={onClose}
                    aria-label={drawer ? "Close answer panel" : "Collapse answer panel"}
                    title={drawer ? "Close answer panel" : "Collapse answer panel"}
                    ref={closeButtonRef}
                  >
                    {drawer ? (
                      <XIcon size={19} aria-hidden />
                    ) : (
                      <SidebarSimpleIcon size={19} aria-hidden />
                    )}
                  </button>
                </h2>
              </Accordion.Header>
              <Accordion.Content className="preparation-content">
                <p className="plan-summary">{question.plan}</p>
                <ol className="plan-steps">
                  {planSteps.map((step, index) => (
                    <li key={`${step.title}-${step.description}`}>
                      <span className="plan-step-number">{index + 1}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <p>{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Accordion.Content>
            </Accordion.Item>

            <section
              className="preparation-recorder-section"
              aria-labelledby="record-response-heading"
            >
              <div className="preparation-recorder-heading">
                <MicrophoneIcon size={20} weight="duotone" aria-hidden />
                <div>
                  <h2 id="record-response-heading">Record your response</h2>
                  <p>Speak naturally; you can review the audio before saving.</p>
                </div>
              </div>
              <RecorderPanel questionKey={questionKey} onSave={onRecordingSave} />
            </section>

            <Accordion.Item className="preparation-section model-answer-section" value="answers">
              <Accordion.Header asChild>
                <h2 className="preparation-heading">
                  <Accordion.Trigger className="preparation-trigger model-answer-trigger">
                    <ChatTextIcon size={20} weight="duotone" aria-hidden />
                    <span>
                      Model answers
                      <small>Review sample responses at any time</small>
                    </span>
                    <AccordionChevron />
                  </Accordion.Trigger>
                </h2>
              </Accordion.Header>
              <Accordion.Content className="preparation-content accordion-content">
                <div className="answer-tabs" role="tablist" aria-label="Model answers">
                  {answers.map((answer, index) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={answerIndex === index}
                      aria-controls={`answer-panel-${questionKey}-${index}`}
                      id={`answer-tab-${questionKey}-${index}`}
                      tabIndex={answerIndex === index ? 0 : -1}
                      className="answer-tab"
                      data-active={answerIndex === index}
                      key={answer.id}
                      onClick={() => setAnswerIndex(index)}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowLeft" &&
                          event.key !== "ArrowRight" &&
                          event.key !== "Home" &&
                          event.key !== "End"
                        ) {
                          return;
                        }
                        event.preventDefault();
                        const nextIndex =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? answers.length - 1
                              : (index + (event.key === "ArrowRight" ? 1 : -1) + answers.length) %
                                answers.length;
                        selectAnswerTab(nextIndex);
                      }}
                    >
                      Answer {index + 1}
                    </button>
                  ))}
                </div>
                {answers.map((answer, index) => (
                  <p
                    className="model-answer-copy"
                    id={`answer-panel-${questionKey}-${index}`}
                    role="tabpanel"
                    aria-labelledby={`answer-tab-${questionKey}-${index}`}
                    tabIndex={answerIndex === index ? 0 : -1}
                    hidden={answerIndex !== index}
                    key={answer.id}
                  >
                    {answer.text}
                  </p>
                ))}
                <button
                  type="button"
                  className="copy-answer-button"
                  onClick={() => {
                    void copyText(answers[answerIndex].text);
                    onNotice("Model answer copied.");
                  }}
                >
                  <CopyIcon size={17} aria-hidden />
                  Copy answer
                </button>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </div>
      </aside>
    </>
  );
}

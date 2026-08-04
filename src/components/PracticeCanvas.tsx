import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { ListChecksIcon } from "@phosphor-icons/react/ListChecks";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Question, Topic } from "../types/toefl";
import { QuestionStepper } from "./QuestionStepper";
import { SpeakingStudyMaterials } from "./SpeakingStudyMaterials";

interface PracticeCanvasProps {
  topic: Topic;
  question: Question;
  questionIndex: number;
  questionKey: string;
  saved: boolean;
  onSelectQuestion: (index: number) => void;
  onToggleSaved: () => void;
  preparationOpen: boolean;
  preparationButtonRef?: React.Ref<HTMLButtonElement>;
  onOpenPreparation: () => void;
  onNotice: (message: string) => void;
}

export function PracticeCanvas({
  topic,
  question,
  questionIndex,
  questionKey,
  saved,
  onSelectQuestion,
  onToggleSaved,
  preparationOpen,
  preparationButtonRef,
  onOpenPreparation,
  onNotice,
}: PracticeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (questionKey && canvas && typeof canvas.scrollTo === "function") {
      canvas.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [questionKey]);

  return (
    <main className="practice-canvas" id="main-content" tabIndex={-1} ref={canvasRef}>
      <div className="practice-column">
        <div className="question-heading">
          <div>
            <p className="topic-eyebrow">{topic.title}</p>
            <h1>
              Question {questionIndex + 1} of {topic.questions.length}
            </h1>
          </div>
          <button
            type="button"
            className="save-question-button"
            data-saved={saved}
            aria-pressed={saved}
            aria-label={saved ? "Remove saved question" : "Save this question"}
            onClick={onToggleSaved}
          >
            <BookmarkSimpleIcon size={22} weight={saved ? "fill" : "regular"} aria-hidden />
            <span>{saved ? "Saved" : "Save"}</span>
          </button>
        </div>

        <QuestionStepper
          currentIndex={questionIndex}
          count={topic.questions.length}
          onSelect={onSelectQuestion}
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="question-content"
            key={questionKey}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="question-reference">
              <p className="question-prompt">{question.prompt}</p>
              <button
                type="button"
                className="preparation-drawer-trigger"
                ref={preparationButtonRef}
                onClick={onOpenPreparation}
                aria-expanded={preparationOpen}
                aria-controls="response-preparation-panel"
              >
                <ListChecksIcon size={18} weight="duotone" aria-hidden />
                Answer plan
              </button>
            </div>
            <p className="speaking-material-guidance">
              Use the ideas to shape your answer, then borrow collocations that sound natural.
            </p>
            <SpeakingStudyMaterials question={question} onNotice={onNotice} />
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

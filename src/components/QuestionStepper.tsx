interface QuestionStepperProps {
  currentIndex: number;
  count: number;
  onSelect: (index: number) => void;
}

export function QuestionStepper({
  currentIndex,
  count,
  onSelect,
}: QuestionStepperProps): React.JSX.Element {
  return (
    <ol className="question-stepper" aria-label="Question progress">
      {Array.from({ length: count }, (_, index) => index + 1).map((questionNumber) => {
        const index = questionNumber - 1;
        const state =
          index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming";

        return (
          <li className="stepper-item" data-state={state} key={questionNumber}>
            {index > 0 ? (
              <span
                className="stepper-connector"
                data-completed={index <= currentIndex}
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              className="stepper-button"
              onClick={() => onSelect(index)}
              aria-label={`Question ${questionNumber}`}
              aria-current={index === currentIndex ? "step" : undefined}
            >
              Q{questionNumber}
            </button>
            {index === currentIndex ? <span className="stepper-current-mark" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

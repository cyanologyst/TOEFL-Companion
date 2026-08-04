import { CopyIcon } from "@phosphor-icons/react/Copy";
import { LightbulbIcon } from "@phosphor-icons/react/Lightbulb";
import { QuotesIcon } from "@phosphor-icons/react/Quotes";
import { copyText } from "../lib/clipboard";
import { formatCount } from "../lib/format";
import { parsePhrase } from "../lib/question";
import type { Question } from "../types/toefl";

interface SpeakingStudyMaterialsProps {
  question: Question;
  onNotice: (message: string) => void;
}

export function SpeakingStudyMaterials({
  question,
  onNotice,
}: SpeakingStudyMaterialsProps): React.JSX.Element {
  return (
    <section className="speaking-materials" aria-label="Ideas and collocations">
      <section className="speaking-material-column" aria-labelledby="speaking-ideas-heading">
        <header className="speaking-material-header">
          <span className="speaking-material-icon" aria-hidden>
            <LightbulbIcon size={19} weight="duotone" />
          </span>
          <div>
            <h2 id="speaking-ideas-heading">Ideas</h2>
            <p>{formatCount(question.ideas.length, "angle")}</p>
          </div>
        </header>

        <ol className="speaking-idea-list">
          {question.ideas.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ol>
      </section>

      <section
        className="speaking-material-column speaking-material-column--collocations"
        aria-labelledby="speaking-collocations-heading"
      >
        <header className="speaking-material-header">
          <span className="speaking-material-icon" aria-hidden>
            <QuotesIcon size={19} weight="duotone" />
          </span>
          <div>
            <h2 id="speaking-collocations-heading">Collocations</h2>
            <p>{formatCount(question.collocations.length, "phrase")}</p>
          </div>
        </header>

        <ul className="speaking-collocation-list">
          {question.collocations.map((collocation) => {
            const { phrase, meaning } = parsePhrase(collocation);
            return (
              <li key={collocation}>
                <div className="speaking-collocation-copy">
                  <strong>{phrase}</strong>
                  {meaning ? <span>{meaning}</span> : null}
                </div>
                <button
                  type="button"
                  className="collocation-copy-button"
                  aria-label={`Copy collocation: ${phrase}`}
                  title="Copy collocation"
                  onClick={() => {
                    void copyText(collocation).then(() => {
                      onNotice(`Copied “${phrase}”.`);
                    });
                  }}
                >
                  <CopyIcon size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

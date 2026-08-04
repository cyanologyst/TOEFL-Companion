import { DoodleIcon } from "../../components/DoodleIcon";
import { VocabularyLibrary } from "../../components/VocabularyLibrary";
import { useVocabularySnapshot } from "../../hooks/useVocabularySnapshot";

interface VocabularyLibraryPageProps {
  initialWordId?: string;
  onNotice: (message: string) => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
}

export function VocabularyLibraryPage({
  initialWordId,
  onNotice,
  onOpenReview,
  onOpenSettings,
}: VocabularyLibraryPageProps): React.JSX.Element {
  const snapshot = useVocabularySnapshot();

  return (
    <div className="page vocabulary-library-page">
      <nav className="vocabulary-library-page__tabs" aria-label="Vocabulary">
        <button type="button" aria-current="page">
          <DoodleIcon name="doc" size={18} />
          Library
        </button>
        <button type="button" onClick={onOpenReview}>
          <DoodleIcon name="sync" size={18} />
          Review
        </button>
      </nav>

      <VocabularyLibrary
        snapshot={snapshot}
        initialWordId={initialWordId}
        onNotice={onNotice}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

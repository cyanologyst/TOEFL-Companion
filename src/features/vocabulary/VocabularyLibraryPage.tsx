import { VocabularyLibrary } from "../../components/VocabularyLibrary";
import { useVocabularySnapshot } from "../../hooks/useVocabularySnapshot";

interface VocabularyLibraryPageProps {
  initialWordId?: string;
  onNotice: (message: string) => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
}

/** The library owns its own page shell, including the Library/Review switch,
 *  so this route is only the wiring between the app and that surface. */
export function VocabularyLibraryPage({
  initialWordId,
  onNotice,
  onOpenReview,
  onOpenSettings,
}: VocabularyLibraryPageProps): React.JSX.Element {
  const snapshot = useVocabularySnapshot();

  return (
    <VocabularyLibrary
      snapshot={snapshot}
      initialWordId={initialWordId}
      onNotice={onNotice}
      onOpenReview={onOpenReview}
      onOpenSettings={onOpenSettings}
    />
  );
}

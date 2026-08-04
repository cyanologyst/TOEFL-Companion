import { useEffect, useState } from "react";
import { vocabularyRepository, type VocabularySnapshot } from "../services/vocabularyRepository";

export function useVocabularySnapshot(): VocabularySnapshot {
  const [snapshot, setSnapshot] = useState<VocabularySnapshot>(() =>
    vocabularyRepository.getSnapshot(),
  );

  useEffect(() => {
    const refresh = () => setSnapshot(vocabularyRepository.getSnapshot());
    window.addEventListener(vocabularyRepository.changeEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(vocabularyRepository.changeEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return snapshot;
}

import { useState } from "react";
import { useVocabularySnapshot } from "../hooks/useVocabularySnapshot";
import { appBackupService } from "../services/appBackup";
import { vocabularyRepository } from "../services/vocabularyRepository";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "../services/vocabularyBrowser";
import type { VocabularySettings } from "../types/vocabulary";
import { VocabularySettings as VocabularySettingsForm } from "./VocabularySettings";

interface VocabularySettingsPageProps {
  onNotice: (message: string) => void;
}

function downloadJson(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function VocabularySettingsPage({
  onNotice,
}: VocabularySettingsPageProps): React.JSX.Element {
  const snapshot = useVocabularySnapshot();
  const [permission, setPermission] = useState(getNotificationPermission);

  return (
    <div className="settings-page-host">
      <VocabularySettingsForm
        settings={snapshot.settings}
        notificationPermission={permission}
        onSave={(settings: VocabularySettings) => {
          vocabularyRepository.saveSettings(settings);
        }}
        onRequestNotifications={async () => {
          setPermission(await requestNotificationPermission());
        }}
        onExportBackup={() => {
          downloadJson(appBackupService.createBackup(), appBackupService.suggestedFileName());
        }}
        onRestoreBackup={async (file) => {
          appBackupService.restoreBackup(await file.text());
        }}
        onReset={() => {
          vocabularyRepository.resetSettings();
        }}
        onNotice={onNotice}
      />
    </div>
  );
}

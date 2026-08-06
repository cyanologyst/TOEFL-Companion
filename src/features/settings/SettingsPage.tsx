import { useMemo, useRef, useState } from "react";
import { DoodleIcon, type DoodleIconName } from "../../components/DoodleIcon";
import { AsyncStatus, ConfirmDialog } from "../../components/StudyUI";
import { useVocabularySnapshot } from "../../hooks/useVocabularySnapshot";
import {
  restoreDesktopBackup,
  serializeDesktopBackup,
  suggestedDesktopBackupName,
} from "../../services/desktopBackup";
import { studyRepository } from "../../services/studyRepository";
import { vocabularyRepository } from "../../services/vocabularyRepository";
import type { StudySettings } from "../../types/study";
import "../../brutal.css";
import type { NotificationMode, VocabularySettings } from "../../types/vocabulary";

interface SettingsPageProps {
  initialSettings: StudySettings;
  onNotice: (message: string) => void;
  onChanged: () => void;
}

type SettingsSection = "profile" | "practice" | "reminders" | "audio" | "storage";
type AsyncPhase = "idle" | "loading" | "success" | "error";

interface LocalSettingsDraft {
  study: StudySettings;
  reminderInterval: number;
  notificationMode: NotificationMode;
  speechRate: number;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
}

interface PendingRestore {
  name: string;
  contents: string;
}

const SETTINGS_SECTIONS: ReadonlyArray<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: DoodleIconName;
}> = [
  { id: "profile", label: "Profile", description: "Name and test date", icon: "target" },
  { id: "practice", label: "Practice", description: "Timers and draft saving", icon: "stopwatch" },
  { id: "reminders", label: "Reminders", description: "Vocabulary recall cards", icon: "bell" },
  { id: "audio", label: "Audio", description: "Speech and sound cues", icon: "speaker" },
  { id: "storage", label: "Storage", description: "Local backup and restore", icon: "floppy" },
];

function download(contents: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createDraft(study: StudySettings, vocabulary: VocabularySettings): LocalSettingsDraft {
  return {
    study: { ...study },
    reminderInterval: vocabulary.reminderIntervalMinutes,
    notificationMode: vocabulary.notificationMode,
    speechRate: vocabulary.speechRate,
    quietHours: vocabulary.quietHoursEnabled,
    quietStart: vocabulary.quietHoursStart,
    quietEnd: vocabulary.quietHoursEnd,
  };
}

function draftsMatch(left: LocalSettingsDraft, right: LocalSettingsDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function SettingsPage({
  initialSettings,
  onNotice,
  onChanged,
}: SettingsPageProps): React.JSX.Element {
  const vocabulary = useVocabularySnapshot();
  const initialDraftRef = useRef(createDraft(initialSettings, vocabulary.settings));
  const [settings, setSettings] = useState<StudySettings>(initialSettings);
  const [reminderInterval, setReminderInterval] = useState(
    initialDraftRef.current.reminderInterval,
  );
  const [notificationMode, setNotificationMode] = useState<NotificationMode>(
    initialDraftRef.current.notificationMode,
  );
  const [speechRate, setSpeechRate] = useState(initialDraftRef.current.speechRate);
  const [quietHours, setQuietHours] = useState(initialDraftRef.current.quietHours);
  const [quietStart, setQuietStart] = useState(initialDraftRef.current.quietStart);
  const [quietEnd, setQuietEnd] = useState(initialDraftRef.current.quietEnd);
  const [savedDraft, setSavedDraft] = useState<LocalSettingsDraft>(initialDraftRef.current);
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [saveStatus, setSaveStatus] = useState<AsyncPhase>("idle");
  const [notificationStatus, setNotificationStatus] = useState<AsyncPhase>("idle");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [backupStatus, setBackupStatus] = useState<AsyncPhase>("idle");
  const [backupMessage, setBackupMessage] = useState("");
  const [reminderStatus, setReminderStatus] = useState("");
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const currentDraft = useMemo<LocalSettingsDraft>(
    () => ({
      study: settings,
      reminderInterval,
      notificationMode,
      speechRate,
      quietHours,
      quietStart,
      quietEnd,
    }),
    [notificationMode, quietEnd, quietHours, quietStart, reminderInterval, settings, speechRate],
  );
  const isDirty = !draftsMatch(currentDraft, savedDraft);

  const save = () => {
    if (!isDirty || saveStatus === "loading") {
      return;
    }
    setSaveStatus("loading");
    try {
      studyRepository.saveSettings(settings);
      vocabularyRepository.saveSettings({
        ...vocabularyRepository.getSnapshot().settings,
        reminderIntervalMinutes: reminderInterval,
        notificationMode,
        speechRate,
        quietHoursEnabled: quietHours,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        soundEnabled: settings.playSounds,
      });
      setSavedDraft(currentDraft);
      setSaveStatus("success");
      onChanged();
      onNotice("Settings saved on this device.");
    } catch (error) {
      setSaveStatus("error");
      onNotice(error instanceof Error ? error.message : "Settings could not be saved.");
    }
  };

  const stageRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setBackupStatus("loading");
    setBackupMessage("Reading backup...");
    try {
      const contents = await file.text();
      setPendingRestore({ name: file.name, contents });
      setBackupStatus("idle");
      setBackupMessage("Backup is ready for confirmation.");
    } catch (error) {
      setBackupStatus("error");
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be read.");
    }
  };

  const applyRestore = async () => {
    if (!pendingRestore) {
      return;
    }
    setBackupStatus("loading");
    setBackupMessage("Restoring local study data...");
    try {
      restoreDesktopBackup(pendingRestore.contents);
      const restoredStudy = studyRepository.getSnapshot().settings;
      const restoredVocabulary = vocabularyRepository.getSnapshot().settings;
      const restoredDraft = createDraft(restoredStudy, restoredVocabulary);
      setSettings(restoredStudy);
      setReminderInterval(restoredDraft.reminderInterval);
      setNotificationMode(restoredDraft.notificationMode);
      setSpeechRate(restoredDraft.speechRate);
      setQuietHours(restoredDraft.quietHours);
      setQuietStart(restoredDraft.quietStart);
      setQuietEnd(restoredDraft.quietEnd);
      setSavedDraft(restoredDraft);
      setPendingRestore(null);
      setBackupStatus("success");
      setBackupMessage(`Restored ${pendingRestore.name}.`);
      onChanged();
      onNotice("Backup restored. Local study data is ready.");
    } catch (error) {
      setBackupStatus("error");
      setBackupMessage(
        error instanceof Error ? error.message : "The backup could not be restored.",
      );
      onNotice(error instanceof Error ? error.message : "The backup could not be restored.");
    }
  };

  const exportBackup = async () => {
    setBackupStatus("loading");
    setBackupMessage("Preparing complete backup...");
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      download(serializeDesktopBackup(), suggestedDesktopBackupName());
      setBackupStatus("success");
      setBackupMessage("Backup downloaded.");
      onNotice("Complete backup exported.");
    } catch (error) {
      setBackupStatus("error");
      setBackupMessage(
        error instanceof Error ? error.message : "The backup could not be exported.",
      );
    }
  };

  const requestNotifications = async () => {
    setNotificationStatus("loading");
    setNotificationMessage("Waiting for system permission...");
    if (!("Notification" in window)) {
      setNotificationStatus("error");
      setNotificationMessage("System notifications are unavailable on this device.");
      onNotice("System notifications are unavailable on this device.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      const granted = result === "granted";
      setNotificationStatus(granted ? "success" : "error");
      setNotificationMessage(
        granted ? "System notifications enabled." : "System notifications remain disabled.",
      );
      onNotice(granted ? "System notifications enabled." : "System notifications remain disabled.");
    } catch (error) {
      setNotificationStatus("error");
      setNotificationMessage(
        error instanceof Error ? error.message : "Notification permission could not be requested.",
      );
    }
  };

  const pauseReminders = (minutes: number | null) => {
    try {
      vocabularyRepository.pauseReminders(minutes);
      const message = minutes === null ? "Reminders resumed." : "Reminders paused for one hour.";
      setReminderStatus(message);
      onNotice(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Reminder status could not be changed.";
      setReminderStatus(message);
      onNotice(message);
    }
  };

  const saveMessage = isDirty
    ? "Unsaved changes"
    : saveStatus === "success"
      ? "All settings saved"
      : "No pending changes";

  return (
    <div className="brutal settings-page">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="setting" size={28} />
          </span>
          <div>
            <h1>Settings</h1>
            <p className="b-eyebrow">Practice, reminders, audio, storage</p>
          </div>
        </div>
        <div className="brutal__head-actions">
          <span className="settings-save-summary" data-dirty={isDirty} aria-live="polite">
            {saveMessage}
          </span>
          <button
            type="button"
            className="b-btn b-btn--lime"
            onClick={save}
            disabled={!isDirty || saveStatus === "loading"}
          >
            {saveStatus === "loading" ? "Saving..." : "Save settings"}
          </button>
        </div>
      </header>

      <div className="set-b__body">
        <nav className="b-frame set-b__nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              type="button"
              key={section.id}
              className="set-b__nav-item"
              data-active={activeSection === section.id}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              <DoodleIcon name={section.icon} size={20} />
              <span>
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="b-frame set-b__panel">
          {activeSection === "profile" ? (
            <section className="panel settings-section" id="profile-settings">
              <header>
                <span>
                  <DoodleIcon name="target" size={22} />
                </span>
                <div>
                  <h2>Learner profile</h2>
                  <p>Used only inside this local app.</p>
                </div>
              </header>
              <div className="settings-fields settings-fields--two">
                <label>
                  Display name
                  <input
                    value={settings.learnerName}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        learnerName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Target test date
                  <input
                    type="date"
                    value={settings.targetTestDate}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        targetTestDate: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </section>
          ) : null}

          {activeSection === "practice" ? (
            <section className="panel settings-section" id="practice-settings">
              <header>
                <span>
                  <DoodleIcon name="stopwatch" size={22} />
                </span>
                <div>
                  <h2>Practice timing</h2>
                  <p>Adjust working timers without changing source content.</p>
                </div>
              </header>
              <div className="settings-fields settings-fields--two">
                <label>
                  Interview response time
                  <select
                    value={settings.interviewSeconds}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        interviewSeconds: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={30}>30 seconds</option>
                    <option value={40}>40 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
                <label>
                  Academic Discussion timer
                  <select
                    value={settings.writingSeconds}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        writingSeconds: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                    <option value={900}>15 minutes</option>
                    <option value={1_200}>20 minutes</option>
                  </select>
                </label>
              </div>
              <label className="setting-toggle setting-toggle--switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={settings.autoSaveWriting}
                  checked={settings.autoSaveWriting}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      autoSaveWriting: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Automatically save writing drafts</strong>
                  <small>Drafts remain on this device until you clear them.</small>
                </span>
              </label>
            </section>
          ) : null}

          {activeSection === "reminders" ? (
            <section className="panel settings-section" id="reminder-settings">
              <header>
                <span>
                  <DoodleIcon name="bell" size={22} />
                </span>
                <div>
                  <h2>Vocabulary reminders</h2>
                  <p>Show an optional recall card while the app is open.</p>
                </div>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => void requestNotifications()}
                  disabled={notificationStatus === "loading"}
                >
                  {notificationStatus === "loading"
                    ? "Requesting permission..."
                    : "Allow system notifications"}
                </button>
              </header>
              <AsyncStatus
                status={notificationStatus}
                message={notificationMessage || undefined}
                onRetry={() => void requestNotifications()}
              />
              <div className="settings-fields settings-fields--two">
                <label>
                  Reminder interval
                  <select
                    value={reminderInterval}
                    onChange={(event) => setReminderInterval(Number(event.target.value))}
                  >
                    <option value={10}>Every 10 minutes</option>
                    <option value={20}>Every 20 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                    <option value={120}>Every 2 hours</option>
                  </select>
                </label>
                <label>
                  Delivery
                  <select
                    value={notificationMode}
                    onChange={(event) =>
                      setNotificationMode(event.target.value as NotificationMode)
                    }
                  >
                    <option value="popup">In-app reminder card</option>
                    <option value="system">System notification</option>
                    <option value="both">Both</option>
                    <option value="toast">Compact in-app toast</option>
                    <option value="off">Off</option>
                  </select>
                </label>
              </div>
              <label className="setting-toggle setting-toggle--switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={quietHours}
                  checked={quietHours}
                  onChange={(event) => setQuietHours(event.target.checked)}
                />
                <span>
                  <strong>Quiet hours</strong>
                  <small>Do not interrupt long reading or rest periods.</small>
                </span>
              </label>
              {quietHours ? (
                <div className="settings-fields settings-fields--two compact-time-fields">
                  <label>
                    Start
                    <input
                      type="time"
                      value={quietStart}
                      onChange={(event) => setQuietStart(event.target.value)}
                    />
                  </label>
                  <label>
                    End
                    <input
                      type="time"
                      value={quietEnd}
                      onChange={(event) => setQuietEnd(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              <div className="settings-inline-actions">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => pauseReminders(60)}
                >
                  Pause 1 hour
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => pauseReminders(null)}
                >
                  Resume
                </button>
                <span className="settings-inline-status" role="status" aria-live="polite">
                  {reminderStatus}
                </span>
              </div>
            </section>
          ) : null}

          {activeSection === "audio" ? (
            <section className="panel settings-section" id="audio-settings">
              <header>
                <span>
                  <DoodleIcon name="speaker" size={22} />
                </span>
                <div>
                  <h2>Audio &amp; speech</h2>
                  <p>Used for vocabulary pronunciation and starter repeat prompts.</p>
                </div>
              </header>
              <label className="range-field">
                <span>
                  Speech rate <strong>{speechRate.toFixed(1)}×</strong>
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.1}
                  value={speechRate}
                  onChange={(event) => setSpeechRate(Number(event.target.value))}
                />
              </label>
              <label className="setting-toggle setting-toggle--switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={settings.playSounds}
                  checked={settings.playSounds}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      playSounds: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Interface sound cues</strong>
                  <small>Off by default for low-distraction study sessions.</small>
                </span>
              </label>
            </section>
          ) : null}

          {activeSection === "storage" ? (
            <section className="panel settings-section" id="storage-settings">
              <header>
                <span>
                  <DoodleIcon name="floppy" size={22} />
                </span>
                <div>
                  <h2>Local data</h2>
                  <p>Back up vocabulary, progress, transcripts, and writing revisions.</p>
                </div>
              </header>
              <div className="storage-summary">
                <div>
                  <strong>On-device first</strong>
                  <p>
                    Structured study data uses versioned local storage. Saved audio is kept in
                    IndexedDB and remains on this device.
                  </p>
                </div>
                <span>Local</span>
              </div>
              <AsyncStatus
                status={backupStatus}
                message={backupMessage || undefined}
                onRetry={() => (pendingRestore ? void applyRestore() : void exportBackup())}
                retryLabel={pendingRestore ? "Try restore again" : "Export again"}
              />
              <input
                ref={restoreRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(event) => void stageRestore(event)}
              />
              <div className="settings-inline-actions">
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => void exportBackup()}
                  disabled={backupStatus === "loading"}
                >
                  <DoodleIcon name="download" size={17} />
                  Export complete backup
                </button>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => restoreRef.current?.click()}
                  disabled={backupStatus === "loading"}
                >
                  <DoodleIcon name="upload" size={17} />
                  Restore backup
                </button>
              </div>
            </section>
          ) : null}

          <AsyncStatus
            className="settings-save-status"
            status={saveStatus}
            message={
              saveStatus === "loading"
                ? "Saving settings..."
                : saveStatus === "success"
                  ? "Settings saved on this device."
                  : saveStatus === "error"
                    ? "Settings could not be saved."
                    : undefined
            }
            onRetry={save}
          />
        </div>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore this backup?"
        description="Current local vocabulary, speaking progress, writing drafts, settings, and history will be replaced by the backup."
        confirmLabel="Restore backup"
        tone="danger"
        pending={backupStatus === "loading"}
        onClose={() => {
          if (backupStatus !== "loading") {
            setPendingRestore(null);
            setBackupStatus("idle");
            setBackupMessage("");
          }
        }}
        onConfirm={applyRestore}
      >
        {pendingRestore ? (
          <p>
            Selected file: <strong>{pendingRestore.name}</strong>
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

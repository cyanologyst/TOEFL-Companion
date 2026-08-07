import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { BellIcon } from "@phosphor-icons/react/Bell";
import { BookOpenTextIcon } from "@phosphor-icons/react/BookOpenText";
import { DesktopIcon } from "@phosphor-icons/react/Desktop";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { DatabaseIcon } from "@phosphor-icons/react/Database";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SpeakerHighIcon } from "@phosphor-icons/react/SpeakerHigh";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { VocabularySettings as VocabularySettingsData } from "../types/vocabulary";
import { ConfirmDialog } from "./StudyUI";
import "../vocabulary-settings.css";

export interface VocabularySettingsProps {
  settings: VocabularySettingsData;
  notificationPermission: NotificationPermission | "unsupported";
  onSave: (settings: VocabularySettingsData) => void | Promise<void>;
  onRequestNotifications: () => void | Promise<void>;
  onExportBackup: () => void | Promise<void>;
  onRestoreBackup: (file: File) => void | Promise<void>;
  onReset: () => void | Promise<void>;
  onNotice: (message: string) => void;
}

interface ToggleFieldProps {
  id: string;
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

type SettingsSectionId =
  | "schedule"
  | "notifications"
  | "application"
  | "review"
  | "speech"
  | "data";

const SECTION_SEARCH_TERMS: Record<SettingsSectionId, string> = {
  schedule: "reminders schedule timing interval frequency due first random daily goal quiet hours",
  notifications: "notifications in-app system both off popup duration sound permission toast",
  application:
    "application shortcut keyboard ctrl alt r clipboard quick add fullscreen compact device",
  review: "review study session cards size goal focused practice",
  speech: "speech voice rate pronunciation listen dictionary definition enrichment",
  data: "data privacy backup export restore import reset local device",
};

const NOTIFICATION_OPTIONS = [
  {
    value: "popup",
    label: "In-app",
    description: "Show a review card while this app is open.",
  },
  {
    value: "system",
    label: "System",
    description: "Show a Windows notification when the app is in the background.",
  },
  {
    value: "both",
    label: "Both",
    description: "Use in-app cards and permitted Windows notifications.",
  },
  {
    value: "off",
    label: "Off",
    description: "Pause automatic vocabulary reminders.",
  },
] as const;

const REVIEW_ORDER_OPTIONS = [
  {
    value: "dueFirst",
    label: "Due first",
    description: "Prioritize words that are ready for review.",
  },
  {
    value: "random",
    label: "Random",
    description: "Shuffle eligible words for more variety.",
  },
] as const;

const INTERVAL_PRESETS = [15, 30, 60] as const;
const SPEECH_PREVIEW_TEXT =
  "Your vocabulary review is ready. Take a moment and recall the meaning.";

function ToggleField({
  id,
  checked,
  label,
  description,
  onChange,
  disabled = false,
}: ToggleFieldProps): React.JSX.Element {
  return (
    <div
      className={`settings-workspace-toggle-row${
        disabled ? " settings-workspace-toggle-row--disabled" : ""
      }`}
    >
      <div className="settings-workspace-toggle-copy">
        <label className="settings-workspace-toggle-label" htmlFor={id}>
          {label}
        </label>
        <p className="settings-workspace-toggle-description" id={`${id}-help`}>
          {description}
        </p>
      </div>
      <label className="settings-workspace-switch" htmlFor={id}>
        <input
          className="settings-workspace-switch-input"
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-checked={checked}
          aria-describedby={`${id}-help`}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="settings-workspace-switch-track" aria-hidden />
      </label>
    </div>
  );
}

function clampNumber(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeTime(value: string, fallback: string): string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function createSettingsDraft(settings: VocabularySettingsData): VocabularySettingsData {
  return {
    ...settings,
    notificationMode: settings.notificationMode === "toast" ? "system" : settings.notificationMode,
  };
}

function permissionLabel(permission: VocabularySettingsProps["notificationPermission"]): string {
  switch (permission) {
    case "granted":
      return "Allowed";
    case "denied":
      return "Blocked";
    case "default":
      return "Not requested";
    case "unsupported":
      return "Not supported";
  }
}

export function VocabularySettings({
  settings,
  notificationPermission,
  onSave,
  onRequestNotifications,
  onExportBackup,
  onRestoreBackup,
  onReset,
  onNotice,
}: VocabularySettingsProps): React.JSX.Element {
  const [draft, setDraft] = useState<VocabularySettingsData>(() => createSettingsDraft(settings));
  const [query, setQuery] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningDataAction, setIsRunningDataAction] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dataActionError, setDataActionError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsFingerprintRef = useRef(JSON.stringify(settings));
  const idPrefix = useId();

  useEffect(() => {
    const nextFingerprint = JSON.stringify(settings);
    if (nextFingerprint === settingsFingerprintRef.current) {
      return;
    }

    settingsFingerprintRef.current = nextFingerprint;
    setDraft(createSettingsDraft(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return undefined;
    }

    const loadVoices = () => {
      const nextVoices = window.speechSynthesis
        .getVoices()
        .slice()
        .sort((first, second) => {
          if (first.default !== second.default) {
            return first.default ? -1 : 1;
          }

          return `${first.lang} ${first.name}`.localeCompare(`${second.lang} ${second.name}`);
        });
      setVoices(nextVoices);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const currentFingerprint = useMemo(() => JSON.stringify(draft), [draft]);
  const settingsFingerprint = useMemo(() => JSON.stringify(settings), [settings]);
  const isDirty = currentFingerprint !== settingsFingerprint;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(
    () =>
      (Object.keys(SECTION_SEARCH_TERMS) as SettingsSectionId[]).filter(
        (sectionId) =>
          !normalizedQuery || SECTION_SEARCH_TERMS[sectionId].includes(normalizedQuery),
      ),
    [normalizedQuery],
  );
  const showsSection = (sectionId: SettingsSectionId) => visibleSections.includes(sectionId);
  const usesInAppNotifications =
    draft.notificationMode === "popup" || draft.notificationMode === "both";
  const usesSystemNotifications =
    draft.notificationMode === "system" ||
    draft.notificationMode === "toast" ||
    draft.notificationMode === "both";
  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";
  const selectedVoiceIsUnavailable =
    Boolean(draft.voiceName) && !voices.some((voice) => voice.name === draft.voiceName);

  function updateSetting<Key extends keyof VocabularySettingsData>(
    key: Key,
    value: VocabularySettingsData[Key],
  ) {
    setSaveError("");
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateBoundedNumber(
    key:
      | "reminderIntervalMinutes"
      | "popupDurationSeconds"
      | "dailyReviewGoal"
      | "defaultSessionSize"
      | "speechRate",
    value: number,
    minimum: number,
    maximum: number,
  ) {
    if (!Number.isFinite(value)) {
      return;
    }

    updateSetting(key, clampNumber(value, minimum, maximum, draft[key]));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || isSaving) {
      return;
    }

    const normalizedDraft: VocabularySettingsData = {
      ...draft,
      reminderIntervalMinutes: Math.round(clampNumber(draft.reminderIntervalMinutes, 1, 180, 60)),
      popupDurationSeconds: Math.round(clampNumber(draft.popupDurationSeconds, 5, 120, 18)),
      dailyReviewGoal: Math.round(clampNumber(draft.dailyReviewGoal, 1, 500, 20)),
      defaultSessionSize: Math.round(clampNumber(draft.defaultSessionSize, 5, 100, 20)),
      speechRate: clampNumber(draft.speechRate, 0.5, 2, 1),
      quietHoursStart: normalizeTime(draft.quietHoursStart, "22:00"),
      quietHoursEnd: normalizeTime(draft.quietHoursEnd, "07:00"),
      notificationMode: draft.notificationMode === "toast" ? "system" : draft.notificationMode,
      globalHotkeyEnabled: draft.reviewShortcutEnabled,
    };

    setIsSaving(true);
    setSaveError("");
    try {
      await onSave(normalizedDraft);
      settingsFingerprintRef.current = JSON.stringify(normalizedDraft);
      setDraft(normalizedDraft);
      onNotice("Vocabulary settings saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Settings could not be saved. Please try again.";
      setSaveError(message);
      onNotice(`Settings could not be saved. ${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function discardChanges() {
    setSaveError("");
    setDraft(createSettingsDraft(settings));
    onNotice("Unsaved settings discarded.");
  }

  function clearSettingsSearch() {
    setQuery("");
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  async function requestNotifications() {
    try {
      await onRequestNotifications();
    } catch {
      onNotice("The notification request could not be completed.");
    }
  }

  function testSpeech() {
    if (!speechSupported) {
      onNotice("Speech playback is not available on this device.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(SPEECH_PREVIEW_TEXT);
    utterance.rate = draft.speechRate;
    const selectedVoice = voices.find((voice) => voice.name === draft.voiceName);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    onNotice("Playing the selected voice.");
  }

  async function exportBackup() {
    if (isRunningDataAction) {
      return;
    }

    setIsRunningDataAction(true);
    setDataActionError("");
    try {
      await onExportBackup();
      onNotice("Backup exported.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The backup could not be exported.";
      setDataActionError(message);
      onNotice(`The backup could not be exported. ${message}`);
    } finally {
      setIsRunningDataAction(false);
    }
  }

  async function restoreBackup(file: File) {
    if (isRunningDataAction) {
      return;
    }

    setIsRunningDataAction(true);
    setDataActionError("");
    try {
      if (file.size > 25_000_000) {
        throw new Error("Choose a backup smaller than 25 MB.");
      }
      if (
        file.type &&
        file.type !== "application/json" &&
        !file.name.toLocaleLowerCase().endsWith(".json")
      ) {
        throw new Error("Choose a JSON backup file.");
      }
      await onRestoreBackup(file);
      onNotice("Backup restored.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "That backup could not be restored.";
      setDataActionError(message);
      onNotice(`That backup could not be restored. ${message}`);
    } finally {
      setIsRunningDataAction(false);
      if (restoreInputRef.current) {
        restoreInputRef.current.value = "";
      }
    }
  }

  async function resetVocabularyData() {
    if (isRunningDataAction) {
      return;
    }

    setIsRunningDataAction(true);
    setDataActionError("");
    try {
      await onReset();
      onNotice("Vocabulary preferences reset.");
      setResetOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Vocabulary preferences could not be reset.";
      setDataActionError(message);
      onNotice(`Vocabulary preferences could not be reset. ${message}`);
    } finally {
      setIsRunningDataAction(false);
    }
  }

  const intervalId = `${idPrefix}-interval`;
  const popupDurationId = `${idPrefix}-popup-duration`;
  const dailyGoalId = `${idPrefix}-daily-goal`;
  const quietHoursId = `${idPrefix}-quiet-hours`;
  const quietStartId = `${idPrefix}-quiet-start`;
  const quietEndId = `${idPrefix}-quiet-end`;
  const globalShortcutId = `${idPrefix}-global-shortcut`;
  const clipboardId = `${idPrefix}-clipboard`;
  const compactFullscreenId = `${idPrefix}-compact-fullscreen`;
  const soundId = `${idPrefix}-sound`;
  const sessionSizeId = `${idPrefix}-session-size`;
  const voiceId = `${idPrefix}-voice`;
  const speechRateId = `${idPrefix}-speech-rate`;
  const dictionaryId = `${idPrefix}-dictionary`;

  return (
    <form className="brutal settings-workspace" onSubmit={saveSettings}>
      <header className="brutal__head settings-workspace-header">
        <div className="brutal__title settings-workspace-header-copy">
          <span className="brutal__title-mark" aria-hidden>
            <BellIcon size={26} weight="regular" />
          </span>
          <div>
            <h1 className="settings-workspace-title">Reminder settings</h1>
            <p className="b-eyebrow settings-workspace-intro">Saved on this device</p>
          </div>
        </div>
        <span
          className={`b-tag settings-workspace-change-state${
            isDirty ? " settings-workspace-change-state--dirty" : ""
          }${saveError ? " settings-workspace-change-state--error" : ""}`}
          aria-live="polite"
        >
          {saveError
            ? "Save failed"
            : isSaving
              ? "Saving…"
              : isDirty
                ? "Unsaved changes"
                : "Saved locally"}
        </span>
      </header>

      <div className="brutal__body settings-workspace-body">
        <div className="b-frame settings-workspace-panel">
          <div className="settings-workspace-search">
            <label
              className="b-field settings-workspace-search-field"
              htmlFor={`${idPrefix}-search`}
            >
              <MagnifyingGlassIcon size={18} weight="regular" aria-hidden />
              <span className="sr-only">Search settings</span>
              <input
                ref={searchInputRef}
                className="settings-workspace-search-input"
                id={`${idPrefix}-search`}
                type="search"
                value={query}
                autoComplete="off"
                placeholder="Search reminder, voice, backup…"
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
              />
              {query ? (
                <button
                  type="button"
                  className="settings-workspace-search-clear"
                  aria-label="Clear settings search"
                  onClick={clearSettingsSearch}
                >
                  <XIcon size={16} weight="bold" aria-hidden />
                </button>
              ) : null}
            </label>
            <p className="settings-workspace-search-status" aria-live="polite">
              Showing {visibleSections.length} of 6 sections
            </p>
          </div>

          <div className="b-scroll settings-workspace-section-list">
            {showsSection("schedule") ? (
              <section
                className="settings-workspace-section"
                aria-labelledby={`${idPrefix}-schedule-title`}
              >
                <header className="settings-workspace-section-header">
                  <span className="settings-workspace-section-icon" aria-hidden>
                    <ClockIcon size={21} weight="regular" />
                  </span>
                  <div className="settings-workspace-section-heading">
                    <h2
                      className="settings-workspace-section-title"
                      id={`${idPrefix}-schedule-title`}
                    >
                      Schedule
                    </h2>
                    <p className="settings-workspace-section-description">
                      Set a pace that supports recall without interrupting focus.
                    </p>
                  </div>
                </header>

                <div className="settings-workspace-grid">
                  <div className="settings-workspace-field settings-workspace-field--wide">
                    <div className="settings-workspace-label-row">
                      <label className="settings-workspace-label" htmlFor={intervalId}>
                        Reminder interval
                      </label>
                      <span className="settings-workspace-value">
                        {draft.reminderIntervalMinutes} min
                      </span>
                    </div>
                    <div className="settings-workspace-number-row">
                      <input
                        className="settings-workspace-input settings-workspace-input--number"
                        id={intervalId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={180}
                        step={1}
                        value={draft.reminderIntervalMinutes}
                        onChange={(event) =>
                          updateBoundedNumber(
                            "reminderIntervalMinutes",
                            event.currentTarget.valueAsNumber,
                            1,
                            180,
                          )
                        }
                      />
                      <span className="settings-workspace-input-suffix">minutes</span>
                      <fieldset className="settings-workspace-preset-group">
                        <legend className="sr-only">Reminder interval presets</legend>
                        {INTERVAL_PRESETS.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            className="settings-workspace-preset"
                            aria-pressed={draft.reminderIntervalMinutes === minutes}
                            onClick={() => updateSetting("reminderIntervalMinutes", minutes)}
                          >
                            {minutes} min
                          </button>
                        ))}
                      </fieldset>
                    </div>
                    <p className="settings-workspace-helper">
                      Choose any interval from 1 to 180 minutes.
                    </p>
                  </div>

                  <fieldset className="settings-workspace-field settings-workspace-field--wide">
                    <legend className="settings-workspace-label">Review order</legend>
                    <div className="settings-workspace-choice-grid settings-workspace-choice-grid--two">
                      {REVIEW_ORDER_OPTIONS.map((option) => (
                        <label key={option.value} className="settings-workspace-choice">
                          <input
                            className="settings-workspace-choice-input"
                            type="radio"
                            name={`${idPrefix}-review-order`}
                            value={option.value}
                            checked={draft.selectionMode === option.value}
                            onChange={() => updateSetting("selectionMode", option.value)}
                          />
                          <span className="settings-workspace-choice-content">
                            <span className="settings-workspace-choice-label">{option.label}</span>
                            <span className="settings-workspace-choice-description">
                              {option.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="settings-workspace-field">
                    <label className="settings-workspace-label" htmlFor={dailyGoalId}>
                      Daily review goal
                    </label>
                    <div className="settings-workspace-number-row">
                      <input
                        className="settings-workspace-input settings-workspace-input--number"
                        id={dailyGoalId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={500}
                        step={1}
                        value={draft.dailyReviewGoal}
                        onChange={(event) =>
                          updateBoundedNumber(
                            "dailyReviewGoal",
                            event.currentTarget.valueAsNumber,
                            1,
                            500,
                          )
                        }
                      />
                      <span className="settings-workspace-input-suffix">words</span>
                    </div>
                    <p className="settings-workspace-helper">
                      A visible target, not a punishment. Choose 1 to 500 words.
                    </p>
                  </div>

                  <div className="settings-workspace-field settings-workspace-field--wide">
                    <ToggleField
                      id={quietHoursId}
                      checked={draft.quietHoursEnabled}
                      label="Quiet hours"
                      description="Hold automatic reminders during a protected time window."
                      onChange={(checked) => updateSetting("quietHoursEnabled", checked)}
                    />
                    <fieldset
                      className="settings-workspace-time-range"
                      data-disabled={!draft.quietHoursEnabled}
                    >
                      <legend className="sr-only">Quiet hours range</legend>
                      <div className="settings-workspace-time-field">
                        <label className="settings-workspace-label" htmlFor={quietStartId}>
                          Starts
                        </label>
                        <input
                          className="settings-workspace-input"
                          id={quietStartId}
                          type="time"
                          value={draft.quietHoursStart}
                          disabled={!draft.quietHoursEnabled}
                          onChange={(event) =>
                            updateSetting("quietHoursStart", event.currentTarget.value)
                          }
                        />
                      </div>
                      <span className="settings-workspace-time-separator" aria-hidden>
                        to
                      </span>
                      <div className="settings-workspace-time-field">
                        <label className="settings-workspace-label" htmlFor={quietEndId}>
                          Ends
                        </label>
                        <input
                          className="settings-workspace-input"
                          id={quietEndId}
                          type="time"
                          value={draft.quietHoursEnd}
                          disabled={!draft.quietHoursEnabled}
                          onChange={(event) =>
                            updateSetting("quietHoursEnd", event.currentTarget.value)
                          }
                        />
                      </div>
                    </fieldset>
                  </div>
                </div>
              </section>
            ) : null}

            {showsSection("notifications") ? (
              <section
                className="settings-workspace-section"
                aria-labelledby={`${idPrefix}-notifications-title`}
              >
                <header className="settings-workspace-section-header">
                  <span className="settings-workspace-section-icon" aria-hidden>
                    <BellIcon size={21} weight="regular" />
                  </span>
                  <div className="settings-workspace-section-heading">
                    <h2
                      className="settings-workspace-section-title"
                      id={`${idPrefix}-notifications-title`}
                    >
                      Notifications
                    </h2>
                    <p className="settings-workspace-section-description">
                      Choose where reminders appear and how much attention they use.
                    </p>
                  </div>
                </header>

                <div className="settings-workspace-grid">
                  <fieldset className="settings-workspace-field settings-workspace-field--wide">
                    <legend className="settings-workspace-label">Reminder delivery</legend>
                    <div className="settings-workspace-choice-grid">
                      {NOTIFICATION_OPTIONS.map((option) => (
                        <label key={option.value} className="settings-workspace-choice">
                          <input
                            className="settings-workspace-choice-input"
                            type="radio"
                            name={`${idPrefix}-notification-mode`}
                            value={option.value}
                            checked={draft.notificationMode === option.value}
                            onChange={() => updateSetting("notificationMode", option.value)}
                          />
                          <span className="settings-workspace-choice-content">
                            <span className="settings-workspace-choice-label">{option.label}</span>
                            <span className="settings-workspace-choice-description">
                              {option.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="settings-workspace-field settings-workspace-field--wide">
                    <div
                      className={`settings-workspace-permission${
                        usesSystemNotifications && notificationPermission !== "granted"
                          ? " settings-workspace-permission--attention"
                          : ""
                      }`}
                    >
                      <div className="settings-workspace-permission-copy">
                        {notificationPermission === "granted" ? (
                          <CheckCircleIcon size={20} weight="fill" aria-hidden />
                        ) : (
                          <WarningCircleIcon size={20} weight="regular" aria-hidden />
                        )}
                        <div>
                          <p className="settings-workspace-permission-title">
                            System notification permission
                          </p>
                          <p className="settings-workspace-permission-description">
                            {permissionLabel(notificationPermission)}
                            {usesSystemNotifications && notificationPermission !== "granted"
                              ? " — permission is required for system delivery."
                              : ""}
                          </p>
                        </div>
                      </div>
                      {notificationPermission === "default" ? (
                        <button
                          type="button"
                          className="settings-workspace-button settings-workspace-button--secondary"
                          onClick={() => void requestNotifications()}
                        >
                          Allow notifications
                        </button>
                      ) : null}
                    </div>
                    {notificationPermission === "denied" ? (
                      <p className="settings-workspace-helper">
                        Notifications are blocked. Allow TOEFL Companion in Windows notification
                        settings, then return here.
                      </p>
                    ) : null}
                    {notificationPermission === "unsupported" ? (
                      <p className="settings-workspace-helper">
                        System notifications are unavailable on this device. In-app reminders still
                        work while TOEFL Companion is open.
                      </p>
                    ) : null}
                  </div>

                  <div className="settings-workspace-field">
                    <label className="settings-workspace-label" htmlFor={popupDurationId}>
                      In-app card duration
                    </label>
                    <div className="settings-workspace-number-row">
                      <input
                        className="settings-workspace-input settings-workspace-input--number"
                        id={popupDurationId}
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={120}
                        step={1}
                        value={draft.popupDurationSeconds}
                        disabled={!usesInAppNotifications}
                        onChange={(event) =>
                          updateBoundedNumber(
                            "popupDurationSeconds",
                            event.currentTarget.valueAsNumber,
                            5,
                            120,
                          )
                        }
                      />
                      <span className="settings-workspace-input-suffix">seconds</span>
                    </div>
                    <p className="settings-workspace-helper">
                      Keep each card visible for 5 to 120 seconds.
                    </p>
                  </div>

                  <div className="settings-workspace-field settings-workspace-field--wide">
                    <ToggleField
                      id={soundId}
                      checked={draft.soundEnabled}
                      label="Reminder sound"
                      description="Play a brief, gentle cue when an automatic reminder appears."
                      onChange={(checked) => updateSetting("soundEnabled", checked)}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {showsSection("application") ? (
              <section
                className="settings-workspace-section"
                aria-labelledby={`${idPrefix}-application-title`}
              >
                <header className="settings-workspace-section-header">
                  <span className="settings-workspace-section-icon" aria-hidden>
                    <DesktopIcon size={21} weight="regular" />
                  </span>
                  <div className="settings-workspace-section-heading">
                    <h2
                      className="settings-workspace-section-title"
                      id={`${idPrefix}-application-title`}
                    >
                      Application behavior
                    </h2>
                    <p className="settings-workspace-section-description">
                      Focused shortcuts and privacy-conscious conveniences.
                    </p>
                  </div>
                </header>

                <div className="settings-workspace-stack">
                  <div className="settings-workspace-feature-row">
                    <span className="settings-workspace-feature-icon" aria-hidden>
                      <KeyboardIcon size={20} weight="regular" />
                    </span>
                    <div className="settings-workspace-feature-body">
                      <ToggleField
                        id={globalShortcutId}
                        checked={draft.reviewShortcutEnabled}
                        label="Focused-app review shortcut"
                        description="Open vocabulary review with Ctrl+Alt+R while TOEFL Companion is focused."
                        onChange={(checked) =>
                          setDraft((current) => ({
                            ...current,
                            globalHotkeyEnabled: checked,
                            reviewShortcutEnabled: checked,
                          }))
                        }
                      />
                      <kbd className="settings-workspace-shortcut">
                        Ctrl <span>+</span> Alt <span>+</span> R
                      </kbd>
                      <p className="settings-workspace-helper">
                        This shortcut works only inside TOEFL Companion and is ignored while you
                        type in a field.
                      </p>
                    </div>
                  </div>

                  <ToggleField
                    id={clipboardId}
                    checked={draft.clipboardQuickAddEnabled}
                    label="Clipboard quick add"
                    description="Allow Quick add to read the clipboard only after you click “Paste from clipboard.” The app never watches it in the background."
                    onChange={(checked) => updateSetting("clipboardQuickAddEnabled", checked)}
                  />

                  <ToggleField
                    id={compactFullscreenId}
                    checked={draft.compactNotificationsWhenFullscreen}
                    label="Compact cards in fullscreen"
                    description="Use a smaller in-app reminder while TOEFL Companion is fullscreen."
                    onChange={(checked) =>
                      updateSetting("compactNotificationsWhenFullscreen", checked)
                    }
                  />
                </div>
              </section>
            ) : null}

            {showsSection("review") ? (
              <section
                className="settings-workspace-section"
                aria-labelledby={`${idPrefix}-review-title`}
              >
                <header className="settings-workspace-section-header">
                  <span className="settings-workspace-section-icon" aria-hidden>
                    <BookOpenTextIcon size={21} weight="regular" />
                  </span>
                  <div className="settings-workspace-section-heading">
                    <h2
                      className="settings-workspace-section-title"
                      id={`${idPrefix}-review-title`}
                    >
                      Review sessions
                    </h2>
                    <p className="settings-workspace-section-description">
                      Choose a manageable default without changing saved sessions.
                    </p>
                  </div>
                </header>

                <div className="settings-workspace-grid">
                  <div className="settings-workspace-field">
                    <label className="settings-workspace-label" htmlFor={sessionSizeId}>
                      Default session size
                    </label>
                    <div className="settings-workspace-number-row">
                      <input
                        className="settings-workspace-input settings-workspace-input--number"
                        id={sessionSizeId}
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={100}
                        step={1}
                        value={draft.defaultSessionSize}
                        onChange={(event) =>
                          updateBoundedNumber(
                            "defaultSessionSize",
                            event.currentTarget.valueAsNumber,
                            5,
                            100,
                          )
                        }
                      />
                      <span className="settings-workspace-input-suffix">words</span>
                    </div>
                    <p className="settings-workspace-helper">
                      New sessions begin with 5 to 100 words. You can still adjust a session before
                      starting.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {showsSection("speech") ? (
              <section
                className="settings-workspace-section"
                aria-labelledby={`${idPrefix}-speech-title`}
              >
                <header className="settings-workspace-section-header">
                  <span className="settings-workspace-section-icon" aria-hidden>
                    <SpeakerHighIcon size={21} weight="regular" />
                  </span>
                  <div className="settings-workspace-section-heading">
                    <h2
                      className="settings-workspace-section-title"
                      id={`${idPrefix}-speech-title`}
                    >
                      Speech &amp; dictionary
                    </h2>
                    <p className="settings-workspace-section-description">
                      Tune spoken examples and optional word enrichment.
                    </p>
                  </div>
                </header>

                <div className="settings-workspace-grid">
                  <div className="settings-workspace-field">
                    <label className="settings-workspace-label" htmlFor={voiceId}>
                      Speech voice
                    </label>
                    <select
                      className="settings-workspace-select"
                      id={voiceId}
                      value={draft.voiceName ?? ""}
                      disabled={!speechSupported}
                      onChange={(event) =>
                        updateSetting("voiceName", event.currentTarget.value || null)
                      }
                    >
                      <option value="">System default</option>
                      {selectedVoiceIsUnavailable ? (
                        <option value={draft.voiceName ?? ""}>
                          {draft.voiceName} (unavailable)
                        </option>
                      ) : null}
                      {voices.map((voice) => (
                        <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                          {voice.name} · {voice.lang}
                          {voice.default ? " · Default" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="settings-workspace-helper">
                      Voice availability comes from this device.
                    </p>
                  </div>

                  <div className="settings-workspace-field">
                    <div className="settings-workspace-label-row">
                      <label className="settings-workspace-label" htmlFor={speechRateId}>
                        Speech rate
                      </label>
                      <output className="settings-workspace-value" htmlFor={speechRateId}>
                        {draft.speechRate.toFixed(1)}×
                      </output>
                    </div>
                    <input
                      className="settings-workspace-range"
                      id={speechRateId}
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={draft.speechRate}
                      disabled={!speechSupported}
                      onChange={(event) =>
                        updateBoundedNumber("speechRate", event.currentTarget.valueAsNumber, 0.5, 2)
                      }
                    />
                    <div className="settings-workspace-range-scale" aria-hidden>
                      <span>Slower</span>
                      <span>Natural</span>
                      <span>Faster</span>
                    </div>
                    <button
                      type="button"
                      className="settings-workspace-button settings-workspace-button--secondary settings-workspace-button--test"
                      disabled={!speechSupported}
                      onClick={testSpeech}
                    >
                      <PlayIcon size={17} weight="fill" aria-hidden />
                      Test voice
                    </button>
                  </div>

                  <div className="settings-workspace-field settings-workspace-field--wide">
                    <ToggleField
                      id={dictionaryId}
                      checked={draft.dictionaryLookupEnabled}
                      label="Dictionary enrichment"
                      description="When you request enrichment, add available pronunciation, definition, and word details from the configured dictionary source."
                      onChange={(checked) => updateSetting("dictionaryLookupEnabled", checked)}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {showsSection("data") ? (
              <section
                className="settings-workspace-section"
                aria-labelledby={`${idPrefix}-data-title`}
              >
                <header className="settings-workspace-section-header">
                  <span className="settings-workspace-section-icon" aria-hidden>
                    <DatabaseIcon size={21} weight="regular" />
                  </span>
                  <div className="settings-workspace-section-heading">
                    <h2 className="settings-workspace-section-title" id={`${idPrefix}-data-title`}>
                      Data &amp; privacy
                    </h2>
                    <p className="settings-workspace-section-description">
                      Keep a portable copy before changing or clearing local data.
                    </p>
                  </div>
                </header>

                <div className="settings-workspace-data-actions">
                  <article className="settings-workspace-data-card">
                    <span className="settings-workspace-data-icon" aria-hidden>
                      <DownloadSimpleIcon size={20} weight="regular" />
                    </span>
                    <div className="settings-workspace-data-copy">
                      <h3 className="settings-workspace-data-title">Export backup</h3>
                      <p className="settings-workspace-data-description">
                        Download speaking history, saved questions, vocabulary, progress, and
                        settings as one JSON file. Saved audio remains on this device.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-workspace-button settings-workspace-button--secondary"
                      disabled={isRunningDataAction}
                      onClick={() => void exportBackup()}
                    >
                      Export
                    </button>
                  </article>

                  <article className="settings-workspace-data-card">
                    <span className="settings-workspace-data-icon" aria-hidden>
                      <UploadSimpleIcon size={20} weight="regular" />
                    </span>
                    <div className="settings-workspace-data-copy">
                      <h3 className="settings-workspace-data-title">Restore backup</h3>
                      <p className="settings-workspace-data-description">
                        Select a JSON backup. You will always choose the file explicitly.
                      </p>
                    </div>
                    <input
                      ref={restoreInputRef}
                      className="settings-workspace-file-input"
                      type="file"
                      accept=".json,application/json"
                      disabled={isRunningDataAction}
                      aria-label="Choose a TOEFL Companion backup to restore"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) {
                          void restoreBackup(file);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="settings-workspace-button settings-workspace-button--secondary"
                      disabled={isRunningDataAction}
                      onClick={() => restoreInputRef.current?.click()}
                    >
                      Choose file
                    </button>
                  </article>

                  <article className="settings-workspace-data-card settings-workspace-data-card--danger">
                    <span className="settings-workspace-data-icon" aria-hidden>
                      <ArrowCounterClockwiseIcon size={20} weight="regular" />
                    </span>
                    <div className="settings-workspace-data-copy">
                      <h3 className="settings-workspace-data-title">Reset preferences</h3>
                      <p className="settings-workspace-data-description">
                        Restore reminder, review, audio, and application defaults without deleting
                        words or learning history.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-workspace-button settings-workspace-button--danger"
                      disabled={isRunningDataAction}
                      onClick={() => {
                        setDataActionError("");
                        setResetOpen(true);
                      }}
                    >
                      Reset
                    </button>
                  </article>
                </div>
                {dataActionError ? (
                  <p className="settings-workspace-inline-error" role="alert">
                    <WarningCircleIcon size={17} weight="fill" aria-hidden />
                    {dataActionError}
                  </p>
                ) : null}
              </section>
            ) : null}

            {visibleSections.length === 0 ? (
              <div className="settings-workspace-empty" role="status">
                <MagnifyingGlassIcon size={30} weight="regular" aria-hidden />
                <h2 className="settings-workspace-empty-title">No matching settings</h2>
                <p className="settings-workspace-empty-description">
                  Try a broader term such as “reminder,” “voice,” or “backup.”
                </p>
                <button
                  type="button"
                  className="settings-workspace-button settings-workspace-button--secondary"
                  onClick={clearSettingsSearch}
                >
                  Clear search
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="b-frame settings-workspace-save-bar">
        <div className="settings-workspace-save-copy">
          <FloppyDiskIcon size={20} weight="regular" aria-hidden />
          <span>
            {saveError
              ? `Settings were not saved. ${saveError}`
              : isSaving
                ? "Saving changes on this device…"
                : isDirty
                  ? "Unsaved changes are ready to review."
                  : "Changes are saved on this device."}
          </span>
        </div>
        <div className="settings-workspace-save-actions">
          <button
            type="button"
            className="settings-workspace-button settings-workspace-button--quiet"
            disabled={!isDirty || isSaving}
            onClick={discardChanges}
          >
            Discard
          </button>
          <button
            type="submit"
            className="settings-workspace-button settings-workspace-button--primary"
            disabled={!isDirty || isSaving}
          >
            <FloppyDiskIcon size={17} weight="bold" aria-hidden />
            {isSaving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </footer>

      <ConfirmDialog
        open={resetOpen}
        title="Reset vocabulary preferences?"
        description="Reminder, review, audio, and application preferences return to their defaults. Your words, progress, recordings, and history stay intact."
        confirmLabel="Reset preferences"
        cancelLabel="Keep preferences"
        tone="danger"
        pending={isRunningDataAction}
        onClose={() => {
          if (!isRunningDataAction) {
            setResetOpen(false);
          }
        }}
        onConfirm={() => void resetVocabularyData()}
      >
        {dataActionError ? (
          <p className="settings-workspace-inline-error" role="alert">
            <WarningCircleIcon size={17} weight="fill" aria-hidden />
            {dataActionError}
          </p>
        ) : null}
      </ConfirmDialog>
    </form>
  );
}

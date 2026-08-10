import { useCallback, useEffect, useState } from "react";
import { DoodleIcon } from "../../components/DoodleIcon";
import {
  deleteTranscriptionModel,
  downloadTranscriptionModel,
  formatModelSize,
  getPreferredModelId,
  isTranscriptionSupported,
  listTranscriptionModels,
  setPreferredModelId,
  type TranscriptionModel,
} from "../../services/transcription";
import "./speech-models.css";

interface SpeechModelsProps {
  onNotice: (message: string) => void;
}

/**
 * Chooses which local speech model transcribes speaking practice.
 *
 * The models are downloaded rather than bundled: shipping the recommended one
 * inside the installer would add 190 MB for a feature not every learner uses,
 * and the smaller models are a genuine choice on an old machine rather than a
 * lesser default.
 */
export function SpeechModels({ onNotice }: SpeechModelsProps): React.JSX.Element {
  const supported = isTranscriptionSupported();
  const [models, setModels] = useState<TranscriptionModel[]>([]);
  const [selected, setSelected] = useState(getPreferredModelId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setModels(await listTranscriptionModels());
      setError("");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "The installed speech models could not be read.",
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!supported) {
      setLoaded(true);
      return;
    }
    void refresh();
  }, [refresh, supported]);

  const install = async (model: TranscriptionModel) => {
    setBusyId(model.id);
    setReceived(0);
    setError("");
    try {
      await downloadTranscriptionModel(model.id, (progress) => setReceived(progress.received));
      await refresh();
      setSelected(model.id);
      setPreferredModelId(model.id);
      onNotice(`${model.label} speech model installed and selected.`);
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : "The speech model could not be installed.",
      );
    } finally {
      setBusyId(null);
      setReceived(0);
    }
  };

  const remove = async (model: TranscriptionModel) => {
    setBusyId(model.id);
    setError("");
    try {
      await deleteTranscriptionModel(model.id);
      await refresh();
      onNotice(`${model.label} speech model removed.`);
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "The speech model could not be removed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!supported) {
    return (
      <p className="speech-models__notice">
        On-device transcription runs in the desktop app. In a browser the app falls back to the
        webview's own speech service.
      </p>
    );
  }

  const installedCount = models.filter((model) => model.installed).length;

  return (
    <div className="speech-models">
      <p className="speech-models__lede">
        Speaking answers are transcribed on this device. Nothing is uploaded, and a bigger model
        handles accented English better at the cost of size and time.
      </p>

      {loaded && installedCount === 0 ? (
        <p className="speech-models__notice" role="status">
          No speech model is installed yet, so responses are recorded but not transcribed. Install
          the recommended one to turn transcription on.
        </p>
      ) : null}

      {error ? (
        <p className="speech-models__error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="speech-models__list">
        {models.map((model) => {
          const busy = busyId === model.id;
          const active = model.installed && selected === model.id;
          return (
            <li key={model.id} className="speech-models__item" data-active={active}>
              <span className="speech-models__copy">
                <strong>
                  {model.label}
                  {model.recommended ? <em className="b-tag b-tag--mint">Recommended</em> : null}
                </strong>
                <small>{model.note}</small>
                <small className="speech-models__size">
                  {formatModelSize(model.bytes)}
                  {busy && received > 0
                    ? ` · ${Math.round((received / model.bytes) * 100)}% downloaded`
                    : ""}
                </small>
              </span>

              <span className="speech-models__actions">
                {model.installed ? (
                  <>
                    <button
                      type="button"
                      className={`b-btn ${active ? "b-btn--lime" : ""}`}
                      disabled={active || busy}
                      onClick={() => {
                        setSelected(model.id);
                        setPreferredModelId(model.id);
                        onNotice(`${model.label} is now used for transcription.`);
                      }}
                    >
                      {active ? "In use" : "Use this"}
                    </button>
                    <button
                      type="button"
                      className="b-icon-btn"
                      aria-label={`Remove the ${model.label} model`}
                      title="Remove from this device"
                      disabled={busy}
                      onClick={() => void remove(model)}
                    >
                      <DoodleIcon name="delete" size={17} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="b-btn b-btn--sky"
                    disabled={busyId !== null}
                    onClick={() => void install(model)}
                  >
                    <DoodleIcon name="download" size={16} />
                    {busy ? "Installing…" : "Install"}
                  </button>
                )}
              </span>

              {busy && received > 0 ? (
                <span
                  className="speech-models__bar"
                  role="progressbar"
                  aria-label={`Downloading the ${model.label} model`}
                  aria-valuemin={0}
                  aria-valuemax={model.bytes}
                  aria-valuenow={received}
                >
                  <span style={{ width: `${Math.min(100, (received / model.bytes) * 100)}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

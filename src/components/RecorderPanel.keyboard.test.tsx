import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeakingRecorderController } from "../hooks/useSpeakingRecorder";

const recorder = vi.hoisted(() => ({
  current: null as SpeakingRecorderController | null,
}));

vi.mock("../hooks/useSpeakingRecorder", () => ({
  useSpeakingRecorder: () => recorder.current,
}));

import { RecorderPanel } from "./RecorderPanel";

function controller(): SpeakingRecorderController {
  return {
    phase: "idle",
    failureKind: null,
    countdown: 3,
    secondsLeft: 45,
    transcript: "",
    result: null,
    error: "",
    statusMessage: "Ready.",
    pendingAction: null,
    analyserRef: { current: null },
    isSupported: true,
    isStopping: false,
    start: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    cancel: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(true),
    recordAgain: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  };
}

beforeEach(() => {
  recorder.current = controller();
});

describe("RecorderPanel Space shortcut", () => {
  it("runs only the focused recorder action", () => {
    const { container } = render(<RecorderPanel questionKey="1-1" onSave={() => undefined} />);
    const panel = screen.getByRole("region", {
      name: "Speaking response recorder",
    });
    const start = screen.getByRole("button", {
      name: /start 45-second response/i,
    });

    vi.mocked(recorder.current!.start).mockClear();
    fireEvent.keyDown(panel, { key: " ", code: "Space" });
    expect(recorder.current!.start).not.toHaveBeenCalled();

    const wasNotCancelled = fireEvent.keyDown(start, {
      key: " ",
      code: "Space",
    });
    expect(wasNotCancelled).toBe(false);
    expect(recorder.current!.start).toHaveBeenCalledOnce();

    const outside = document.createElement("button");
    container.append(outside);
    fireEvent.keyDown(outside, { key: " ", code: "Space" });
    expect(recorder.current!.start).toHaveBeenCalledOnce();
  });

  it("does not hijack Space from editable descendants or modified keys", () => {
    render(<RecorderPanel questionKey="1-1" onSave={() => undefined} />);
    const panel = screen.getByRole("region", {
      name: "Speaking response recorder",
    });
    const input = document.createElement("input");
    panel.append(input);
    vi.mocked(recorder.current!.start).mockClear();

    const editableWasNotCancelled = fireEvent.keyDown(input, {
      key: " ",
      code: "Space",
    });
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: /start 45-second response/i,
      }),
      { key: " ", code: "Space", ctrlKey: true },
    );

    expect(editableWasNotCancelled).toBe(true);
    expect(recorder.current!.start).not.toHaveBeenCalled();
  });

  it("returns focus to Start after a pending recording is cancelled", () => {
    recorder.current = {
      ...controller(),
      phase: "requesting",
      statusMessage: "Connecting.",
    };
    const { rerender } = render(<RecorderPanel questionKey="1-1" onSave={() => undefined} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    recorder.current = {
      ...controller(),
      phase: "idle",
      statusMessage: "Cancelled.",
    };
    rerender(<RecorderPanel questionKey="1-1" onSave={() => undefined} />);

    expect(screen.getByRole("button", { name: /start 45-second response/i })).toHaveFocus();
  });

  it("offers explicit Stop and Restart actions while recording", () => {
    recorder.current = {
      ...controller(),
      phase: "recording",
      secondsLeft: 31,
    };
    render(<RecorderPanel questionKey="1-1" onSave={() => undefined} />);

    expect(screen.getByRole("timer", { name: "Time remaining" })).toHaveTextContent("00:31");
    expect(screen.getByRole("button", { name: "Stop" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(recorder.current.cancel).toHaveBeenCalledOnce();
    expect(recorder.current.start).toHaveBeenCalledOnce();
  });
});

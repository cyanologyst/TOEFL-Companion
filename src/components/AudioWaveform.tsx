import { useEffect, useRef } from "react";

interface AudioWaveformProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  active: boolean;
}

export function AudioWaveform({ analyserRef, active }: AudioWaveformProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      analyser.getByteFrequencyData(data);
      context.clearRect(0, 0, bounds.width, bounds.height);

      const barCount = 28;
      const gap = 3;
      const barWidth = Math.max(2, (bounds.width - gap * (barCount - 1)) / barCount);

      for (let index = 0; index < barCount; index += 1) {
        const dataIndex = Math.floor((index / barCount) * data.length);
        const intensity = data[dataIndex] / 255;
        const height = Math.max(4, intensity * (bounds.height - 6));
        const x = index * (barWidth + gap);
        const y = (bounds.height - height) / 2;
        context.fillStyle = `rgba(255, 255, 255, ${0.46 + intensity * 0.5})`;
        context.beginPath();
        context.roundRect(x, y, barWidth, height, barWidth / 2);
        context.fill();
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    draw();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [active, analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-waveform"
      aria-label="Live microphone level"
      role="img"
    />
  );
}

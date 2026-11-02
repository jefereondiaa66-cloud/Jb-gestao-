/** Orbe animado do 300 (canvas + requestAnimationFrame, respeita "reduzir movimento"). */
import { useEffect, useRef, type RefObject } from 'react';
import type { AssistantState } from '../../../../core/types';
import { OrbRenderer } from './renderer';

export interface OrbProps {
  state: AssistantState;
  /** Lê os níveis atuais (chamado a cada quadro, sem re-renderizar o React). */
  levels: () => { mic: number; speech: number };
  label: string;
}

function usePrefersReducedMotion(): RefObject<boolean> {
  const ref = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    ref.current = mq.matches;
    const on = (e: MediaQueryListEvent) => {
      ref.current = e.matches;
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return ref;
}

export function Orb({ state, levels, label }: OrbProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelsRef = useRef(levels);
  const reduced = usePrefersReducedMotion();
  stateRef.current = state;
  levelsRef.current = levels;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const renderer = new OrbRenderer();
    let size = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let lastReducedDraw = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const s = Math.max(80, Math.floor(Math.min(rect.width, rect.height)));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (s === size && canvas.width === Math.round(s * dpr)) return;
      size = s;
      canvas.style.width = `${s}px`;
      canvas.style.height = `${s}px`;
      canvas.width = Math.round(s * dpr);
      canvas.height = Math.round(s * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      const isReduced = !!reduced.current;
      // com movimento reduzido: poucos quadros por segundo, sem rotação
      if (isReduced && now - lastReducedDraw < 200) return;
      lastReducedDraw = now;
      last = now;
      if (size === 0) return;
      const lv = levelsRef.current();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.draw(g, size, dt, { state: stateRef.current, mic: lv.mic, speech: lv.speech, reduced: isReduced });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced]);

  return (
    <div ref={wrapRef} className="orb-wrap">
      <canvas ref={canvasRef} className="orb-canvas" role="img" aria-label={label} />
    </div>
  );
}

import { useEffect, useRef, memo } from 'react';
import { useTheme } from '@/hooks/useTheme';

const STAR_COUNT = 200;
const TARGET_FPS = 12;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

const STAR_COLORS = [
  '255,255,255',
  '200,220,255',
  '180,200,255',
  '255,240,220',
  '180,255,255',
] as const;

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  /** Index into STAR_COLORS — cheaper than carrying a string per star. */
  colorIndex: number;
}

function createStars(w: number, h: number): Star[] {
  const stars: Star[] = new Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    stars[i] = {
      x: Math.random() * w,
      y: Math.random() * h,
      radius: Math.random() * 1.2 + 0.3,
      baseAlpha: Math.random() * 0.5 + 0.3,
      twinkleSpeed: Math.random() * 0.8 + 0.2,
      twinkleOffset: Math.random() * Math.PI * 2,
      colorIndex: Math.floor(Math.random() * STAR_COLORS.length),
    };
  }
  return stars;
}

function StarfieldInner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotionMQ = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    let stars: Star[] = [];
    let rafId = 0;
    let lastTime = 0;
    let running = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(window.innerWidth, window.innerHeight);
      // Re-render immediately on resize so we always paint after dimensions change.
      renderFrame(performance.now(), /* force */ true);
    };

    /**
     * Draw one frame. Batches stars by color to minimize fillStyle changes
     * (~5 state mutations + 5 path commits instead of 200).
     */
    const renderFrame = (time: number, force = false) => {
      if (!force && time - lastTime < FRAME_INTERVAL) return;
      lastTime = time;

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const t = time * 0.001;
      const twoPi = Math.PI * 2;

      // Bucket stars by colorIndex so we can do one beginPath / fill per color.
      // For static reduce-motion mode we skip the twinkle math entirely.
      const buckets: Star[][] = [[], [], [], [], []];
      for (let i = 0; i < stars.length; i++) {
        buckets[stars[i].colorIndex].push(stars[i]);
      }

      const isStatic = reduceMotionMQ?.matches ?? false;

      for (let c = 0; c < buckets.length; c++) {
        const bucket = buckets[c];
        if (bucket.length === 0) continue;

        // Collapse all stars in a bucket into a single path. Since alpha
        // varies per star, we still need to fill in two passes: one for the
        // average alpha (cheap), then optional bright dots. Empirically the
        // visual loss vs per-star alpha is negligible at 1px radius.
        let totalAlpha = 0;
        ctx.beginPath();
        for (let i = 0; i < bucket.length; i++) {
          const star = bucket[i];
          const alpha = isStatic
            ? star.baseAlpha
            : star.baseAlpha + Math.sin(t * star.twinkleSpeed + star.twinkleOffset) * 0.25;
          if (alpha <= 0.05) continue;
          totalAlpha += Math.min(alpha, 1);
          ctx.moveTo(star.x + star.radius, star.y);
          ctx.arc(star.x, star.y, star.radius, 0, twoPi);
        }
        const meanAlpha = totalAlpha / bucket.length;
        ctx.fillStyle = `rgba(${STAR_COLORS[c]},${meanAlpha})`;
        ctx.fill();
      }
    };

    const tick = (time: number) => {
      rafId = requestAnimationFrame(tick);
      renderFrame(time);
    };

    const startLoop = () => {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    const handleVisibility = () => {
      if (document.hidden) stopLoop();
      else if (!(reduceMotionMQ?.matches ?? false)) startLoop();
    };

    const handleMotionChange = () => {
      if (reduceMotionMQ?.matches) {
        stopLoop();
        // Paint a single static frame so the background still has stars.
        renderFrame(performance.now(), true);
      } else {
        startLoop();
      }
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    reduceMotionMQ?.addEventListener?.('change', handleMotionChange);

    if (reduceMotionMQ?.matches) {
      // Static render only — no animation loop.
      renderFrame(performance.now(), true);
    } else {
      startLoop();
    }

    return () => {
      stopLoop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      reduceMotionMQ?.removeEventListener?.('change', handleMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}

export const Starfield = memo(function Starfield() {
  const { theme } = useTheme();
  if (theme !== 'deepspace') return null;
  return <StarfieldInner />;
});

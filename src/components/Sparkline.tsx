import { useId, useMemo, memo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/**
 * Tiny, dependency-free sparkline. Renders a single SVG <path> + a gradient
 * fill + a leading dot at the latest sample.
 *
 * Why not Recharts: Recharts is a fully reactive chart engine — overkill for
 * a 64×18px polyline that ships once per node card. Replacing it with a hand
 * rolled path drops ~150 React elements per dashboard render and removes the
 * runtime cost of Area / YAxis / domain calculation for a graph that has no
 * axes, no tooltip, and no zoom.
 */
export const Sparkline = memo(function Sparkline({
  data,
  width = 64,
  height = 20,
  color = 'var(--color-primary)',
  className,
}: SparklineProps) {
  const gradId = useId();

  const { linePath, areaPath, lastX, lastY } = useMemo(() => {
    if (!data || data.length < 2) {
      return { linePath: '', areaPath: '', lastX: 0, lastY: 0 };
    }
    // Margins mirror the Recharts version so the visual stays identical.
    const padTop = 3;
    const padBottom = 3;
    const padLeft = 2;
    const padRight = 4;
    const w = Math.max(0, width - padLeft - padRight);
    const h = Math.max(0, height - padTop - padBottom);

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const stepX = data.length > 1 ? w / (data.length - 1) : 0;

    let line = '';
    let area = '';
    let lx = padLeft;
    let ly = padTop + h;
    for (let i = 0; i < data.length; i++) {
      const x = padLeft + i * stepX;
      const y = padTop + h - ((data[i] - min) / range) * h;
      line += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
      lx = x;
      ly = y;
    }
    // Close area down to the baseline for the gradient fill.
    area = line + `L${lx.toFixed(2)},${(padTop + h).toFixed(2)} L${padLeft.toFixed(2)},${(padTop + h).toFixed(2)} Z`;
    return { linePath: line, areaPath: area, lastX: lx, lastY: ly };
  }, [data, width, height]);

  if (!data || data.length < 2) return null;

  return (
    <div className={`sparkline-container ${className ?? ''}`} style={{ width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={lastX} cy={lastY} r={5} fill={color} opacity={0.3} className="sparkline-dot-glow" />
        <circle cx={lastX} cy={lastY} r={2} fill={color} className="sparkline-dot-svg" />
      </svg>
    </div>
  );
});

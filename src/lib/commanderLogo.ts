export type CommanderLogoTheme = 'lumina' | 'deepspace' | 'clean';

const palettes: Record<CommanderLogoTheme, {
  plateStart: string;
  plateEnd: string;
  globeFill: string;
  primary: string;
  primaryBright: string;
  core: string;
  status: string;
  sweepStart: number;
  sweepEnd: number;
}> = {
  deepspace: {
    plateStart: '#17314a',
    plateEnd: '#05070b',
    globeFill: '#081522',
    primary: '#22d3ee',
    primaryBright: '#7cf4ff',
    core: '#eaffff',
    status: '#22c55e',
    sweepStart: 0.38,
    sweepEnd: 0.04,
  },
  lumina: {
    plateStart: '#e9f6f8',
    plateEnd: '#d5edf2',
    globeFill: '#f7fdff',
    primary: '#0891b2',
    primaryBright: '#0891b2',
    core: '#0f172a',
    status: '#16a34a',
    sweepStart: 0.2,
    sweepEnd: 0.03,
  },
  clean: {
    plateStart: '#f8fafc',
    plateEnd: '#e7eef3',
    globeFill: '#ffffff',
    primary: '#0e7490',
    primaryBright: '#0e7490',
    core: '#111827',
    status: '#16a34a',
    sweepStart: 0.16,
    sweepEnd: 0.025,
  },
};

export function getCommanderLogoSvg(theme: CommanderLogoTheme): string {
  const p = palettes[theme];
  return `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Komari Commander">
  <defs>
    <radialGradient id="plate" cx="48%" cy="30%" r="82%">
      <stop offset="0%" stop-color="${p.plateStart}"/>
      <stop offset="100%" stop-color="${p.plateEnd}"/>
    </radialGradient>
    <linearGradient id="sweep" x1="256" y1="256" x2="460" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${p.primary}" stop-opacity="${p.sweepStart}"/>
      <stop offset="100%" stop-color="${p.primary}" stop-opacity="${p.sweepEnd}"/>
    </linearGradient>
    <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" rx="96" fill="url(#plate)"/>

  <g transform="translate(256 256)" filter="url(#soft-glow)">
    <circle r="216" fill="${p.globeFill}" stroke="${p.primary}" stroke-width="20"/>
    <path d="M0 0 L180 -112 A216 216 0 0 1 188 80 Z" fill="url(#sweep)"/>
    <path d="M-172 -28 C-76 12 64 16 176 -48" stroke="${p.primaryBright}" stroke-width="22" stroke-linecap="round"/>
    <path d="M-84 -184 C-128 -80 -124 80 -64 184" stroke="${p.primaryBright}" stroke-width="22" stroke-linecap="round"/>
    <circle r="34" fill="${p.core}"/>
    <circle cx="108" cy="56" r="18" fill="${p.status}"/>
  </g>
</svg>`;
}

export function getCommanderLogoDataUri(theme: CommanderLogoTheme): string {
  return `data:image/svg+xml,${encodeURIComponent(getCommanderLogoSvg(theme))}`;
}

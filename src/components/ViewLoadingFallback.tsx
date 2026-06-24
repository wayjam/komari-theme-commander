import { HudSpinner } from '@/components/HudSpinner';

export function ViewLoadingFallback() {
  return (
    <div className="flex min-h-[min(28rem,55vh)] w-full items-center justify-center">
      <HudSpinner size="lg" />
    </div>
  );
}

export function ChartsRouteFallback() {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-border/50 bg-card/50">
      <HudSpinner size="lg" />
    </div>
  );
}

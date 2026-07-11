import { Fragment } from 'react';
import { RotateCcw } from 'lucide-react';
import type { PipelineStep } from '@/lib/api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PipelineWorkflowDotsProps {
  steps: PipelineStep[];
  /** compact=true → smaller dots for story list rows */
  compact?: boolean;
  /** Show a short, always-visible label under each dot (off by default for compact list rows) */
  showLabels?: boolean;
  /** When provided, a Retry button appears above any failed step */
  onRetryStep?: (stepId: string) => void;
  /** Disables the Retry button (e.g. while a retry request is already in flight) */
  retryDisabled?: boolean;
}

const SHORT_LABELS: Record<string, string> = {
  M0: 'Start',
  M1: 'Story',
  M2: 'Images',
  M3: 'Narration',
  M4: 'Subtitles',
  M5: 'Video',
  M6: 'SEO',
  M7: 'Upload',
};

function dotColor(status: PipelineStep['status']): string {
  switch (status) {
    case 'completed': return 'bg-emerald-500';
    case 'running':   return 'bg-blue-400';
    case 'failed':    return 'bg-red-500';
    default:          return 'bg-muted-foreground/25';
  }
}

function lineColor(status: PipelineStep['status']): string {
  return status === 'completed' ? 'bg-emerald-500/50' : 'bg-muted-foreground/15';
}

/**
 * Horizontal pipeline workflow dot row.
 *
 *   ● ─── ● ─── ● ─── ● ─── ● ─── ● ─── ●
 *   M1    M2    M3    M4    M5    M6    M7
 *
 * Green = completed · Blue (pulse) = running · Red = failed · Gray = pending
 * Hover → Radix tooltip with step name + error message.
 */
export function PipelineWorkflowDots({
  steps,
  compact = false,
  showLabels = false,
  onRetryStep,
  retryDisabled = false,
}: PipelineWorkflowDotsProps) {
  const dotSize = compact ? 'h-2.5 w-2.5' : 'h-4 w-4';
  // With labels/retry buttons, columns grow below/above the dot, so the row can no
  // longer be vertically centered — top-align instead and nudge the connector lines
  // down by half a dot-height so they still run through the dot centers.
  const showExtras = showLabels || !!onRetryStep;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`flex w-full ${showExtras ? 'items-start' : 'items-center'} ${onRetryStep ? 'pt-8' : ''}`}>
        {steps.map((step, i) => (
          <Fragment key={step.id}>
            {i > 0 && (
              <div
                className={`flex-1 h-px ${showExtras ? (compact ? 'mt-[5px]' : 'mt-2') : ''} ${lineColor(steps[i - 1]!.status)}`}
              />
            )}

            <div className="relative flex flex-col items-center gap-1.5 shrink-0">
              {onRetryStep && step.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => onRetryStep(step.id)}
                  disabled={retryDisabled}
                  className="absolute -top-8 flex items-center gap-1 whitespace-nowrap rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  Retry
                </button>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={[
                      'rounded-full shrink-0 cursor-default',
                      dotSize,
                      dotColor(step.status),
                      step.status === 'running'
                        ? 'animate-pulse ring-2 ring-blue-400/40 ring-offset-1 ring-offset-background'
                        : '',
                    ].join(' ')}
                  />
                </TooltipTrigger>

                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="font-semibold">{step.name}</p>
                  <p className="text-muted-foreground capitalize mt-0.5">
                    {step.status}
                    {step.progress && ` — ${step.progress.done}/${step.progress.total}`}
                  </p>
                  {step.error && (
                    <p className="text-red-400 mt-1 break-words text-[11px] leading-snug">
                      {step.error}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>

              {showLabels && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {SHORT_LABELS[step.id] ?? step.id}
                  {step.status === 'running' && step.progress && (
                    <span className="text-blue-400 font-medium"> {step.progress.done}/{step.progress.total}</span>
                  )}
                </span>
              )}

              {step.status === 'running' && step.progress && (
                <div className="h-0.5 w-10 rounded-full bg-muted-foreground/20 overflow-hidden">
                  <div
                    className="h-full bg-blue-400 transition-all"
                    style={{ width: `${Math.min(100, (step.progress.done / step.progress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </div>
    </TooltipProvider>
  );
}

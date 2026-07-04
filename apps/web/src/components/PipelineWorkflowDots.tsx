import { Fragment } from 'react';
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
}

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
export function PipelineWorkflowDots({ steps, compact = false }: PipelineWorkflowDotsProps) {
  const dotSize = compact ? 'h-2.5 w-2.5' : 'h-4 w-4';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center w-full">
        {steps.map((step, i) => (
          <Fragment key={step.id}>
            {/* Connector line between dots — colour tracks the step to its left */}
            {i > 0 && (
              <div className={`flex-1 h-px ${lineColor(steps[i - 1]!.status)}`} />
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                {/* The dot */}
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
                <p className="text-muted-foreground capitalize mt-0.5">{step.status}</p>
                {step.error && (
                  <p className="text-red-400 mt-1 break-words text-[11px] leading-snug">
                    {step.error}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </Fragment>
        ))}
      </div>
    </TooltipProvider>
  );
}

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Pause, Play, RotateCcw, ExternalLink, Loader2, AlertCircle, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PipelineWorkflowDots } from '@/components/PipelineWorkflowDots';
import { clipForgeApi, type ClipForgeStatus, type ClipForgePart } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import type { PipelineStep } from '@/lib/api';

const STAGE_DEFS: Array<{ id: string; name: string }> = [
  { id: 'source', name: 'SOURCE READY' },
  { id: 'split', name: 'SPLIT PLANNED' },
  { id: 'continuity', name: 'CONTINUITY VALIDATED' },
  { id: 'processing', name: 'PROCESSING SHORTS' },
  { id: 'uploading', name: 'UPLOADING TO YOUTUBE' },
  { id: 'complete', name: 'COMPLETE' },
];

function deriveStages(status: string, uploadedCount: number): PipelineStep[] {
  if (status === 'COMPLETED') {
    return STAGE_DEFS.map((s) => ({ ...s, status: 'completed' as const }));
  }

  const activeIdx = (() => {
    switch (status) {
      case 'CREATED':
      case 'SOURCE_VALIDATING':
        return 0;
      case 'SOURCE_READY':
      case 'SPLIT_PLANNING':
        return 1;
      case 'CONTINUITY_VALIDATING':
        return 2;
      case 'CONTINUITY_VALIDATION_FAILED':
        return 2;
      case 'PROCESSING':
      case 'UPLOADING':
      case 'WAITING_FOR_YOUTUBE_QUOTA':
      case 'PARTIALLY_COMPLETED':
        return uploadedCount > 0 ? 4 : 3;
      case 'FAILED':
        return uploadedCount > 0 ? 4 : 3;
      default:
        return 0;
    }
  })();

  const isFailedState =
    status === 'FAILED' || status === 'CONTINUITY_VALIDATION_FAILED' || status === 'PARTIALLY_COMPLETED';
  const activeStatus: PipelineStep['status'] = isFailedState ? 'failed' : 'running';

  return STAGE_DEFS.map((s, i) => {
    if (i < activeIdx) return { ...s, status: 'completed' as const };
    if (i === activeIdx) return { ...s, status: activeStatus };
    return { ...s, status: 'pending' as const };
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const PART_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary' | 'outline'> = {
  PENDING: 'outline',
  RENDERING: 'info',
  RENDERED: 'info',
  STORED: 'info',
  SEO_TITLE_GENERATING: 'warning',
  SEO_TITLE_READY: 'warning',
  UPLOAD_PENDING: 'warning',
  UPLOADING: 'warning',
  UPLOADED: 'success',
  COMPLETED: 'success',
  FAILED: 'destructive',
};

function PartRow({ part }: { part: ClipForgePart }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 text-sm font-medium whitespace-nowrap">{part.partLabel}</td>
      <td className="py-2 pr-4 text-sm text-muted-foreground whitespace-nowrap">
        {formatTimestamp(part.startTime)} - {formatTimestamp(part.endTime)}
      </td>
      <td className="py-2 pr-4 text-sm max-w-xs truncate">{part.seoTitle ?? '—'}</td>
      <td className="py-2 pr-4">
        <Badge variant={PART_STATUS_VARIANT[part.status] ?? 'secondary'} className="text-xs">
          {part.status.replace(/_/g, ' ')}
        </Badge>
        {part.status === 'FAILED' && part.lastUploadError && (
          <p className="text-[11px] text-destructive mt-1 max-w-xs break-words">{part.lastUploadError}</p>
        )}
      </td>
      <td className="py-2 pr-2 text-right">
        {part.youtubeVideoUrl ? (
          <a
            href={part.youtubeVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-1 text-xs justify-end"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        ) : part.status === 'FAILED' ? (
          <span className="text-xs text-destructive">—</span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
        )}
      </td>
    </tr>
  );
}

export function ClipForgeDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['clip-forge-project', projectId],
    queryFn: () => clipForgeApi.get(projectId!),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const status = query.state.data as ClipForgeStatus | undefined;
      return status?.isRunning ? 3_000 : 8_000;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['clip-forge-project', projectId] });
    void qc.invalidateQueries({ queryKey: ['clip-forge-projects'] });
  };

  const startMutation = useMutation({ mutationFn: () => clipForgeApi.start(projectId!), onSuccess: invalidate });
  const pauseMutation = useMutation({ mutationFn: () => clipForgeApi.pause(projectId!), onSuccess: invalidate });
  const resumeMutation = useMutation({ mutationFn: () => clipForgeApi.resume(projectId!), onSuccess: invalidate });
  const retryMutation = useMutation({ mutationFn: () => clipForgeApi.retry(projectId!), onSuccess: invalidate });
  const deleteMutation = useMutation({
    mutationFn: () => clipForgeApi.remove(projectId!),
    onSuccess: () => navigate('/clip-forge'),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const { project, parts, isRunning, uploadedCount } = data;
  const isNotStarted = project.status === 'CREATED';
  const hasFailedParts = parts.some((p) => p.status === 'FAILED');
  const isPausable = isRunning;
  const isResumable =
    !isRunning &&
    ['SOURCE_READY', 'SPLIT_PLANNING', 'PROCESSING', 'UPLOADING', 'WAITING_FOR_YOUTUBE_QUOTA', 'PARTIALLY_COMPLETED'].includes(
      project.status,
    );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <Link to="/clip-forge">
          <Button variant="ghost" size="icon" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{project.sourceTitle || 'Untitled (ingesting…)'}</h1>
            <Badge variant="secondary">{project.status.replace(/_/g, ' ')}</Badge>
            {isRunning && (
              <span className="flex items-center gap-1 text-xs text-blue-400 font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />
                Live
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Duration: {formatDuration(project.sourceDuration)} · Total Shorts: {project.totalParts || '—'} · Updated{' '}
            {formatRelative(project.updatedAt)}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          {isNotStarted && (
            <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              {startMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              CREATE SHORTS
            </Button>
          )}
          {isPausable && (
            <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              <Pause className="h-3.5 w-3.5" /> Pause
            </Button>
          )}
          {isResumable && (
            <Button size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              {resumeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Resume
            </Button>
          )}
          {hasFailedParts && !isRunning && (
            <Button size="sm" variant="outline" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
              {retryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Retry Failed
            </Button>
          )}
          {!isRunning && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {project.status === 'CONTINUITY_VALIDATION_FAILED' ? (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-destructive font-medium uppercase tracking-wide flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Continuity Validation Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm text-muted-foreground">
              {project.failureReason ??
                'The split plan did not cover the source video with zero gaps/overlaps — rendering and upload were not started.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-5 pb-4 px-5">
              <PipelineWorkflowDots steps={deriveStages(project.status, uploadedCount)} showLabels />
            </CardContent>
          </Card>

          {project.failureReason && (project.status === 'FAILED' || project.status === 'WAITING_FOR_YOUTUBE_QUOTA' || project.status === 'PARTIALLY_COMPLETED') && (
            <Card className="border-amber-500/40">
              <CardContent className="py-3 px-5">
                <p className="text-sm text-amber-500 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {project.failureReason}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                {uploadedCount} / {project.totalParts || '?'} Shorts Uploaded
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 overflow-x-auto">
              {parts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No parts yet — start the pipeline to begin splitting.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 font-medium">Part</th>
                      <th className="pb-2 font-medium">Timeline</th>
                      <th className="pb-2 font-medium">SEO Title</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">YouTube</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part) => (
                      <PartRow key={part.id} part={part} />
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

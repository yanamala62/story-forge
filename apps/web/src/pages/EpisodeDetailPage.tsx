import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Play, RotateCcw, RefreshCw, ExternalLink,
  BarChart2, Loader2, CheckCircle2, XCircle, Circle, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { PipelineWorkflowDots } from '@/components/PipelineWorkflowDots';
import { episodesApi, pipelineApi, analyticsApi, type PipelineStatus, type PipelineStep } from '@/lib/api';
import { formatRelative, formatDateTime } from '@/lib/utils';

// ── Step detail row ───────────────────────────────────────────────────────────

function stepIcon(status: PipelineStep['status']) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
    case 'running':   return <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />;
    case 'failed':    return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    default:          return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
  }
}

function stepBadge(status: PipelineStep['status']) {
  const variants: Record<PipelineStep['status'], { label: string; cls: string }> = {
    completed: { label: 'Done',     cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
    running:   { label: 'Running',  cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30 animate-pulse' },
    failed:    { label: 'Failed',   cls: 'bg-red-500/15 text-red-500 border-red-500/30' },
    pending:   { label: 'Pending',  cls: 'bg-muted text-muted-foreground border-border' },
  };
  const { label, cls } = variants[status];
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function StepDetailRow({ step, onRetry, isRetrying }: {
  step: PipelineStep;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div className={[
      'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
      step.status === 'running' ? 'bg-blue-500/5 border border-blue-500/20' : '',
      step.status === 'failed'  ? 'bg-red-500/5 border border-red-500/20'  : '',
      step.status === 'pending' || step.status === 'completed' ? 'border border-transparent' : '',
    ].join(' ')}>
      <div className="mt-0.5">{stepIcon(step.status)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${step.status === 'pending' ? 'text-muted-foreground' : ''}`}>
            {step.name}
          </span>
          {stepBadge(step.status)}
        </div>

        {step.status === 'running' && (
          <p className="text-xs text-blue-400 mt-0.5">Processing… check back in a few seconds</p>
        )}

        {step.status === 'failed' && step.error && (
          <div className="flex items-start gap-1.5 mt-1.5">
            <AlertCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 break-words leading-snug">{step.error}</p>
          </div>
        )}
      </div>

      {/* Retry from this step — only show for the failed step */}
      {step.status === 'failed' && onRetry && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs shrink-0 border-red-500/40 text-red-500 hover:bg-red-500/10"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          Retry
        </Button>
      )}
    </div>
  );
}

// ── Pipeline tab ──────────────────────────────────────────────────────────────

function PipelineTab({ pipelineStatus, onRun, isRunMutating }: {
  pipelineStatus: PipelineStatus | undefined;
  onRun: (upload: boolean) => void;
  isRunMutating: boolean;
}) {
  const isRunning   = pipelineStatus?.isRunning ?? false;
  const isFailed    = pipelineStatus?.status === 'FAILED';
  const isPublished = pipelineStatus?.status === 'PUBLISHED';
  const steps       = pipelineStatus?.steps ?? [];

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalSteps     = steps.length;

  return (
    <div className="space-y-4">
      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-blue-400 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pipeline running…
            </span>
          ) : isFailed ? (
            <span className="flex items-center gap-1.5 text-red-500 font-medium">
              <XCircle className="h-3.5 w-3.5" />
              Pipeline failed — click Retry to resume
            </span>
          ) : isPublished ? (
            <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Published
            </span>
          ) : (
            <span>{completedCount}/{totalSteps} steps complete</span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRun(false)}
            disabled={isRunning || isPublished || isRunMutating}
          >
            {isRunning || isRunMutating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isFailed
                ? <RotateCcw className="h-3.5 w-3.5" />
                : <Play className="h-3.5 w-3.5" />}
            {isRunning || isRunMutating ? 'Running…' : isFailed ? 'Retry' : 'Run / Resume'}
          </Button>
          <Button
            size="sm"
            onClick={() => onRun(true)}
            disabled={isRunning || isPublished || isRunMutating}
          >
            <Play className="h-3.5 w-3.5" />
            Run + Upload
          </Button>
        </div>
      </div>

      {/* ── Workflow dot row ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-4 px-5">
          {steps.length > 0 ? (
            <PipelineWorkflowDots steps={steps} />
          ) : (
            <div className="flex items-center gap-1 py-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-4 w-4 rounded-full bg-muted-foreground/20" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step-by-step detail monitor ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
            Step Monitor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pb-4">
          {steps.length === 0
            ? <p className="text-sm text-muted-foreground px-3">No pipeline data yet</p>
            : steps.map((step) => (
                <StepDetailRow
                  key={step.id}
                  step={step}
                  onRetry={step.status === 'failed' ? () => onRun(false) : undefined}
                  isRetrying={isRunMutating}
                />
              ))}
        </CardContent>
      </Card>

      {/* ── Upload records ─────────────────────────────────────────────── */}
      {pipelineStatus?.detail.uploads && pipelineStatus.detail.uploads.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Uploads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {pipelineStatus.detail.uploads.map((u, i) => (
              <div key={i} className="flex items-center justify-between text-sm px-1">
                <span className="font-medium">{u.platform}</span>
                <div className="flex items-center gap-2">
                  {u.platformUrl && (
                    <a
                      href={u.platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-xs"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Badge
                    variant={u.status === 'PUBLISHED' ? 'success' : 'secondary'}
                    className="text-xs"
                  >
                    {u.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Content tab ───────────────────────────────────────────────────────────────

function ContentTab({ episode, pipelineStatus }: {
  episode: ReturnType<typeof episodesApi.get> extends Promise<infer T> ? T : never;
  pipelineStatus: PipelineStatus | undefined;
}) {
  return (
    <div className="space-y-4">
      {/* Progress detail stats */}
      {pipelineStatus && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Output Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Scenes',    value: pipelineStatus.detail.sceneCount },
                { label: 'Images',    value: pipelineStatus.detail.imageCount },
                { label: 'Audio',     value: pipelineStatus.detail.hasAudio ? '✓' : '—' },
                { label: 'Subtitles', value: pipelineStatus.detail.hasSubtitles ? '✓' : '—' },
                { label: 'Video',     value: pipelineStatus.detail.hasVideo ? '✓' : '—' },
                { label: 'SEO',       value: pipelineStatus.detail.hasSeo ? '✓' : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-muted/50 p-2">
                  <div className="text-lg font-semibold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {episode?.hook && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Hook
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm italic text-foreground">"{episode.hook}"</p>
          </CardContent>
        </Card>
      )}

      {episode?.content && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Story Content
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {episode.content}
            </p>
          </CardContent>
        </Card>
      )}

      {episode?.cliffhanger && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Cliffhanger
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm italic text-foreground">"{episode.cliffhanger}"</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ episodeId }: { episodeId: string }) {
  const qc = useQueryClient();

  const { data: analytics } = useQuery({
    queryKey: ['episode-analytics', episodeId],
    queryFn: () => analyticsApi.getEpisodeAnalytics(episodeId),
    refetchInterval: 60_000,
  });

  const collectMutation = useMutation({
    mutationFn: () => analyticsApi.collectForEpisode(episodeId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['episode-analytics', episodeId] }),
  });

  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Analytics are available after the episode is uploaded to YouTube
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => collectMutation.mutate()}
            disabled={collectMutation.isPending}
          >
            {collectMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Try Collecting
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Platform: <span className="font-medium text-foreground">{analytics.platform}</span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => collectMutation.mutate()}
          disabled={collectMutation.isPending}
        >
          {collectMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {analytics.latest ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Views',    value: analytics.latest.views },
              { label: 'Likes',    value: analytics.latest.likes },
              { label: 'Comments', value: analytics.latest.comments },
              { label: 'Saves',    value: analytics.latest.saves },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-right">
            Last collected {formatDateTime(analytics.latest.collectedAt)}
          </p>

          {analytics.history.length > 1 && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                  History ({analytics.history.length} snapshots)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {analytics.history.slice(0, 8).map((snap, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{formatDateTime(snap.collectedAt)}</span>
                    <span>{snap.views.toLocaleString()} views · {snap.likes.toLocaleString()} likes</span>
                  </div>
                ))}
                {analytics.history.length > 8 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{analytics.history.length - 8} more snapshots
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">No snapshots collected yet</p>
            <Button size="sm" onClick={() => collectMutation.mutate()} disabled={collectMutation.isPending}>
              {collectMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <BarChart2 className="h-4 w-4" />}
              Collect Now
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function EpisodeDetailPage() {
  const { storyId, episodeId } = useParams<{ storyId: string; episodeId: string }>();
  const qc = useQueryClient();

  const { data: episode, isLoading: epLoading } = useQuery({
    queryKey: ['episode', episodeId],
    queryFn: () => episodesApi.get(episodeId!),
    enabled: !!episodeId,
    refetchInterval: 8_000,
  });

  const { data: pipelineStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['pipeline-status', episodeId],
    queryFn: () => pipelineApi.status(episodeId!),
    enabled: !!episodeId,
    refetchInterval: (query) => {
      const data = query.state.data as PipelineStatus | undefined;
      return data?.isRunning ? 3_000 : 5_000;
    },
  });

  const runMutation = useMutation({
    mutationFn: (upload: boolean) => pipelineApi.run(episodeId!, upload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pipeline-status', episodeId] });
      void qc.invalidateQueries({ queryKey: ['episode', episodeId] });
    },
  });

  const isRunning = pipelineStatus?.isRunning ?? false;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link to={`/stories/${storyId}`}>
          <Button variant="ghost" size="icon" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          {epLoading ? (
            <Skeleton className="h-8 w-80" />
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold truncate">{episode?.title}</h1>
                {episode && <StatusBadge status={episode.status} />}
                {isRunning && (
                  <span className="flex items-center gap-1 text-xs text-blue-400 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Episode {episode?.episodeNumber}
                {episode && <> · Updated {formatRelative(episode.updatedAt)}</>}
              </p>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => void qc.invalidateQueries({ queryKey: ['pipeline-status', episodeId] })}
        >
          <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Pipeline tab */}
        <TabsContent value="pipeline">
          {statusLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : (
            <PipelineTab
              pipelineStatus={pipelineStatus}
              onRun={(upload) => runMutation.mutate(upload)}
              isRunMutating={runMutation.isPending}
            />
          )}
        </TabsContent>

        {/* Content tab */}
        <TabsContent value="content">
          {epLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : episode ? (
            <ContentTab episode={episode} pipelineStatus={pipelineStatus} />
          ) : (
            <p className="text-sm text-muted-foreground">Episode not found</p>
          )}
        </TabsContent>

        {/* Analytics tab */}
        <TabsContent value="analytics">
          <AnalyticsTab episodeId={episodeId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

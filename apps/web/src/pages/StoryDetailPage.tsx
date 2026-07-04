import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Film, ChevronRight, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { PipelineWorkflowDots } from '@/components/PipelineWorkflowDots';
import { storiesApi, episodesApi, pipelineApi, type Episode, type PipelineStep } from '@/lib/api';
import { formatRelative } from '@/lib/utils';

// ── Status → step derivation ──────────────────────────────────────────────────
//
// Maps an Episode's status enum to a 7-dot PipelineStep[] without requiring an
// extra API call per row.  Each step is either 'completed', 'running', 'failed',
// or 'pending' based only on the status string.
//
const STEP_DEFS: Array<{ id: string; name: string }> = [
  { id: 'M1', name: 'M1: Story + Scenes' },
  { id: 'M2', name: 'M2: Images' },
  { id: 'M3', name: 'M3: Narration' },
  { id: 'M4', name: 'M4: Subtitles' },
  { id: 'M5', name: 'M5: Video' },
  { id: 'M6', name: 'M6: SEO' },
  { id: 'M7', name: 'M7: YouTube Upload' },
];

/** EpisodeStatus → index of the step currently active (0-based, -1 = PENDING/none) */
const STATUS_TO_ACTIVE_STEP: Record<string, number> = {
  PENDING:             -1,
  GENERATING_STORY:     0,
  GENERATING_SCENES:    0,
  GENERATING_PROMPTS:   1,
  GENERATING_IMAGES:    1,
  GENERATING_AUDIO:     2,
  GENERATING_SUBTITLES: 3,
  COMPOSING_VIDEO:      4,
  GENERATING_SEO:       5,
  UPLOADING:            6,
  PUBLISHED:            7,  // all complete
  FAILED:              -2,  // handled separately
};

function deriveStepsFromEpisodeStatus(episode: Episode): PipelineStep[] {
  const activeIdx = STATUS_TO_ACTIVE_STEP[episode.status] ?? -1;

  return STEP_DEFS.map((def, i) => {
    if (episode.status === 'PUBLISHED') {
      return { ...def, status: 'completed' as const };
    }
    if (episode.status === 'FAILED') {
      // All steps before the failed one are 'completed'; the active step is 'failed'
      // We don't know exactly which step failed without querying pipeline/status,
      // so we mark all after the last known status as pending and the boundary as failed.
      // Use a heuristic: if episode has content, M1 done; if has no content → M1 failed.
      // Without detailed data just show status badge + dots as-is from processingError.
      // Steps that have data are 'completed', the next is 'failed', rest 'pending'.
      // We simplify: mark first pending step as failed using episode status context:
      // This is approximate — EpisodeDetailPage has the precise step-level status.
      return { ...def, status: 'pending' as const };
    }
    if (i < activeIdx) return { ...def, status: 'completed' as const };
    if (i === activeIdx) return { ...def, status: 'running' as const };
    return { ...def, status: 'pending' as const };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StoryDetailPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const qc = useQueryClient();

  const { data: story, isLoading: storyLoading } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => storiesApi.get(storyId!),
    enabled: !!storyId,
  });

  const { data: episodesPage, isLoading: episodesLoading } = useQuery({
    queryKey: ['episodes', storyId],
    queryFn: () => episodesApi.list(storyId!),
    enabled: !!storyId,
    refetchInterval: 10_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => episodesApi.generateNext(storyId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['episodes', storyId] });
      void qc.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });

  // Per-episode run mutation (keyed by episodeId via variables)
  const runMutation = useMutation({
    mutationFn: (episodeId: string) => pipelineApi.run(episodeId, false),
    onSuccess: (_data, episodeId) => {
      void qc.invalidateQueries({ queryKey: ['episodes', storyId] });
      void qc.invalidateQueries({ queryKey: ['pipeline-status', episodeId] });
    },
  });

  const episodes = (episodesPage?.data ?? []).sort((a, b) => b.episodeNumber - a.episodeNumber);

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Link to="/stories">
          <Button variant="ghost" size="icon" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          {storyLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <>
              <h1 className="text-2xl font-bold">{story?.title}</h1>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Badge variant="secondary">{story?.genre.replace('_', ' ')}</Badge>
                <Badge variant="outline">{story?.language}</Badge>
                <Badge variant="outline">{story?.style}</Badge>
              </div>
            </>
          )}
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          size="sm"
        >
          <Play className="h-4 w-4" />
          {generateMutation.isPending ? 'Generating...' : 'Generate Episode'}
        </Button>
      </div>

      {/* Synopsis */}
      {story && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">{story.synopsis}</CardContent>
        </Card>
      )}

      {/* Episodes */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          Episodes{' '}
          <span className="text-muted-foreground font-normal text-sm">({episodes.length})</span>
        </h2>

        {episodesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : episodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
            <Film className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No episodes yet — click Generate Episode</p>
          </div>
        ) : (
          <div className="space-y-2">
            {episodes.map((ep) => {
              const isRunnable = ep.status === 'PENDING' || ep.status === 'FAILED';
              const isThisRunning = runMutation.isPending && runMutation.variables === ep.id;
              const steps = deriveStepsFromEpisodeStatus(ep);

              return (
                <Card
                  key={ep.id}
                  className="transition-colors hover:border-primary/50"
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-4">
                      {/* Episode number + title */}
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-2xl font-bold text-muted-foreground w-10 text-right shrink-0">
                          {ep.episodeNumber}
                        </span>
                        <Link
                          to={`/stories/${storyId}/episodes/${ep.id}`}
                          className="min-w-0"
                        >
                          <p className="font-medium text-sm leading-tight truncate">
                            {ep.title || `Episode ${ep.episodeNumber}`}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatRelative(ep.updatedAt)}</p>
                        </Link>
                      </div>

                      {/* Right side: dots + status badge + run button + chevron */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Mini workflow dots */}
                        <div className="w-28 hidden sm:block">
                          <PipelineWorkflowDots steps={steps} compact />
                        </div>

                        <StatusBadge status={ep.status} />

                        {/* Run / Retry button — only for PENDING or FAILED */}
                        {isRunnable && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={isThisRunning}
                            onClick={(e) => {
                              e.preventDefault(); // don't navigate to episode detail
                              runMutation.mutate(ep.id);
                            }}
                          >
                            {isThisRunning ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : ep.status === 'FAILED' ? (
                              <RotateCcw className="h-3 w-3" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                            {isThisRunning ? '' : ep.status === 'FAILED' ? 'Retry' : 'Run'}
                          </Button>
                        )}

                        <Link to={`/stories/${storyId}/episodes/${ep.id}`}>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

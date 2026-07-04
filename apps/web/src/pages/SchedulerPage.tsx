import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PipelineWorkflowDots } from '@/components/PipelineWorkflowDots';
import {
  schedulerApi,
  storiesApi,
  pipelineApi,
  streamPipelineLogs,
  type PipelineLogEntry,
  type PipelineStatus,
  type PipelineStep,
} from '@/lib/api';

const PENDING_STEPS: PipelineStep[] = [
  { id: 'M1', name: 'M1: Story + Scenes', status: 'pending' },
  { id: 'M2', name: 'M2: Images', status: 'pending' },
  { id: 'M3', name: 'M3: Narration', status: 'pending' },
  { id: 'M4', name: 'M4: Subtitles', status: 'pending' },
  { id: 'M5', name: 'M5: Video', status: 'pending' },
  { id: 'M6', name: 'M6: SEO', status: 'pending' },
  { id: 'M7', name: 'M7: YouTube Upload', status: 'pending' },
];

function levelColor(level: PipelineLogEntry['level']): string {
  switch (level) {
    case 'success': return 'text-emerald-400';
    case 'warn': return 'text-amber-400';
    case 'error': return 'text-red-400';
    default: return 'text-muted-foreground';
  }
}

export function SchedulerPage() {
  const { data: storiesData, isLoading: storiesLoading } = useQuery({
    queryKey: ['stories-for-trigger'],
    queryFn: () => storiesApi.list(1, 100),
  });

  const stories = storiesData?.data ?? [];

  const [selectedStoryId, setSelectedStoryId] = useState<string | undefined>(undefined);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Default to the most-recently-updated active story once the list loads
  useEffect(() => {
    if (!selectedStoryId && stories.length > 0) {
      setSelectedStoryId(stories[0]!.id);
    }
  }, [stories, selectedStoryId]);

  const triggerMutation = useMutation({
    mutationFn: (storyId: string) => schedulerApi.triggerNext(storyId),
    onSuccess: (result) => {
      setLogs([]);
      setEpisodeId(result.episodeId);
    },
  });

  const { data: pipelineStatus } = useQuery({
    queryKey: ['pipeline-status', episodeId],
    queryFn: () => pipelineApi.status(episodeId!),
    enabled: !!episodeId,
    refetchInterval: (query) => {
      const data = query.state.data as PipelineStatus | undefined;
      if (!data) return 2_000;
      return data.isRunning ? 2_000 : false;
    },
  });

  // Live log stream — one EventSource per triggered episode
  useEffect(() => {
    if (!episodeId) return;
    return streamPipelineLogs(episodeId, (entry) => {
      setLogs((prev) => [...prev, entry]);
    });
  }, [episodeId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const isRunning =
    triggerMutation.isPending || (!!episodeId && (pipelineStatus?.isRunning ?? true));

  const steps: PipelineStep[] = [
    { id: 'M0', name: 'M0: Episode Created', status: episodeId ? 'completed' : 'pending' },
    ...(pipelineStatus?.steps ?? PENDING_STEPS),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trigger the full content pipeline for a story's next episode
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {storiesLoading ? null : stories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active stories yet —{' '}
              <Link to="/stories" className="text-primary underline">
                create one first
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {stories.length > 1 && (
                <Select value={selectedStoryId} onValueChange={setSelectedStoryId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a story" />
                  </SelectTrigger>
                  <SelectContent>
                    {stories.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                onClick={() => selectedStoryId && triggerMutation.mutate(selectedStoryId)}
                disabled={!selectedStoryId || isRunning}
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {isRunning ? 'Running…' : 'Trigger Pipeline'}
              </Button>

              {triggerMutation.isError && (
                <span className="text-sm text-red-400">{(triggerMutation.error as Error).message}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {episodeId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline Progress</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-5 px-5">
              <PipelineWorkflowDots steps={steps} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Log Monitor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 overflow-y-auto rounded-md bg-black/40 p-3 font-mono text-xs space-y-1">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">Waiting for logs…</p>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className={levelColor(entry.level)}>
                      <span className="text-muted-foreground/60">
                        {new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false })}
                      </span>{' '}
                      {entry.message}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

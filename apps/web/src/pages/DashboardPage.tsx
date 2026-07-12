import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Film, Clock, AlertCircle, Eye, ThumbsUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { YouTubeReconnectDialog } from '@/components/YouTubeReconnectDialog';
import { schedulerApi, storiesApi, healthApi, analyticsApi } from '@/lib/api';
import { SYSTEM_USER_ID } from '@/lib/api';
import { formatRelative } from '@/lib/utils';

function StatCard({ title, value, icon: Icon, sub }: { title: string; value: string | number; icon: React.ElementType; sub?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data: stories, isLoading: storiesLoading } = useQuery({
    queryKey: ['stories', SYSTEM_USER_ID],
    queryFn: () => storiesApi.list(1, 100),
  });

  const { data: analyticsSummary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: analyticsApi.getSummary,
    refetchInterval: 60_000,
  });

  const { data: schedulerData, isLoading: schedulerLoading } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: schedulerApi.status,
    refetchInterval: 15_000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.check,
    // Poll YouTube's health more eagerly than the rest — its refresh token
    // can go bad between visits, and the Reconnect button needs to appear
    // (or disappear, once fixed) without a manual page reload.
    refetchInterval: 30_000,
  });

  const [reconnectOpen, setReconnectOpen] = useState(false);

  const scheduler = schedulerData?.scheduler;
  const youtubeHealth = health?.services?.['youtube'];
  const youtubeDown = youtubeHealth?.status === 'down';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">StoryForge AI — autonomous video generation</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {storiesLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Active Stories" value={stories?.total ?? 0} icon={BookOpen} />
            <StatCard
              title="Total Triggered"
              value={schedulerLoading ? '—' : (scheduler?.totalTriggered ?? 0)}
              icon={Film}
              sub={scheduler?.lastRunAt ? `Last: ${formatRelative(scheduler.lastRunAt)}` : 'Never run'}
            />
            <StatCard
              title="Total Views"
              value={analyticsSummary ? analyticsSummary.totalViews.toLocaleString() : '—'}
              icon={Eye}
              sub={analyticsSummary ? `${analyticsSummary.totalLikes.toLocaleString()} likes` : undefined}
            />
            <StatCard
              title="Total Comments"
              value={analyticsSummary ? analyticsSummary.totalComments.toLocaleString() : '—'}
              icon={ThumbsUp}
              sub={analyticsSummary ? `${analyticsSummary.snapshotCount} snapshots` : undefined}
            />
          </>
        )}
      </div>

      {/* Two-column: Scheduler info + Health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Pipeline Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {schedulerLoading ? (
              <Skeleton className="h-20" />
            ) : scheduler ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last run</span>
                  <span>{scheduler.lastRunAt ? formatRelative(scheduler.lastRunAt) : 'Never'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total triggered</span>
                  <span>{scheduler.totalTriggered}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Could not load pipeline activity</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {health?.services
              ? Object.entries(health.services).map(([name, svc]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-muted-foreground capitalize">{name}</span>
                    <div className="flex items-center gap-2">
                      {svc.latencyMs !== undefined && (
                        <span className="text-xs text-muted-foreground">{svc.latencyMs}ms</span>
                      )}
                      <Badge
                        variant={
                          svc.status === 'up' ? 'success' : svc.status === 'unknown' ? 'secondary' : 'destructive'
                        }
                      >
                        {svc.status}
                      </Badge>
                      {name === 'youtube' && youtubeDown && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 px-2 text-xs"
                          onClick={() => setReconnectOpen(true)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reconnect
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              : <Skeleton className="h-16" />}
          </CardContent>
        </Card>
      </div>

      <YouTubeReconnectDialog open={reconnectOpen} onOpenChange={setReconnectOpen} />
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Scissors, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { clipForgeApi, type ClipForgeProject } from '@/lib/api';
import { formatRelative } from '@/lib/utils';

function CreateClipForgeDialog() {
  const [open, setOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const navigate = useNavigate();

  const { mutate, isPending, error } = useMutation({
    mutationFn: clipForgeApi.create,
    onSuccess: (project: ClipForgeProject) => {
      setOpen(false);
      setYoutubeUrl('');
      setOwnershipConfirmed(false);
      navigate(`/clip-forge/${project.id}`);
    },
  });

  const canSubmit = youtubeUrl.trim().length > 0 && ownershipConfirmed && !isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New Clip Forge Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clip Forge</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Turn your full YouTube video into continuous Shorts.
          </p>

          <div className="space-y-1">
            <Label>YouTube Video Link</Label>
            <Input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              checked={ownershipConfirmed}
              onChange={(e) => setOwnershipConfirmed(e.target.checked)}
            />
            I own this video or have permission to process and republish it.
          </label>

          {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}

          <Button
            className="w-full"
            onClick={() => mutate({ youtubeUrl: youtubeUrl.trim(), ownershipConfirmed })}
            disabled={!canSubmit}
          >
            {isPending ? 'Creating...' : 'CREATE SHORTS'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClipForgePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['clip-forge-projects'],
    queryFn: () => clipForgeApi.list(1, 50),
    refetchInterval: 10_000,
  });

  const projects = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clip Forge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Turn your full YouTube video into continuous Shorts.
          </p>
        </div>
        <CreateClipForgeDialog />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Scissors className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No Clip Forge projects yet</p>
          <p className="text-sm text-muted-foreground">Paste a YouTube link to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} to={`/clip-forge/${project.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50 cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">
                      {project.sourceTitle || 'Untitled (ingesting…)'}
                    </CardTitle>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{project.status.replace(/_/g, ' ')}</Badge>
                    {project.totalParts > 0 && <Badge variant="outline">{project.totalParts} Shorts</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <CardDescription className="line-clamp-2 text-xs break-all">{project.sourceUrl}</CardDescription>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatRelative(project.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

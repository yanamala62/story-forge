import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { storiesApi, SYSTEM_USER_ID, type CreateStoryPayload } from '@/lib/api';
import { formatRelative } from '@/lib/utils';

const GENRES = ['ACTION','ADVENTURE','ROMANCE','HORROR','MYSTERY','FANTASY','SCI_FI','DRAMA','COMEDY','THRILLER'];
const LANGUAGES = [{ value: 'EN', label: 'English' }, { value: 'HI', label: 'Hindi' }, { value: 'TE', label: 'Telugu' }];

function CreateStoryDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateStoryPayload>({
    title: '', genre: 'ACTION', language: 'EN', synopsis: '', targetAudience: '13-35',
  });

  const qc = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: storiesApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stories', SYSTEM_USER_ID] });
      setOpen(false);
      setForm({ title: '', genre: 'ACTION', language: 'EN', synopsis: '', targetAudience: '13-35' });
      onCreated();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> New Story</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Story</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. The Wandering Samurai" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Genre</Label>
              <Select value={form.genre} onValueChange={(v) => setForm((f) => ({ ...f, genre: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => <SelectItem key={g} value={g}>{g.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Synopsis</Label>
            <Textarea
              value={form.synopsis}
              onChange={(e) => setForm((f) => ({ ...f, synopsis: e.target.value }))}
              placeholder="Brief story premise..."
              rows={3}
            />
          </div>
          {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
          <Button
            className="w-full"
            onClick={() => mutate(form)}
            disabled={isPending || !form.title || !form.synopsis}
          >
            {isPending ? 'Creating...' : 'Create Story'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StoriesPage() {
  const qc = useQueryClient();
  const [languageFilter, setLanguageFilter] = useState<string>('ALL');
  const { data, isLoading } = useQuery({
    queryKey: ['stories', SYSTEM_USER_ID, languageFilter],
    queryFn: () => storiesApi.list(1, 50, languageFilter === 'ALL' ? undefined : languageFilter),
  });

  const stories = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stories</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.total ?? 0} active stories</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All languages</SelectItem>
              {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <CreateStoryDialog onCreated={() => void qc.invalidateQueries({ queryKey: ['stories', SYSTEM_USER_ID] })} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : stories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No stories yet</p>
          <p className="text-sm text-muted-foreground">Create a story to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <Link key={story.id} to={`/stories/${story.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50 cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{story.title}</CardTitle>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{story.genre.replace('_', ' ')}</Badge>
                    <Badge variant="outline">{story.language}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <CardDescription className="line-clamp-2 text-xs">{story.synopsis}</CardDescription>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{story.episodeCount} episode{story.episodeCount !== 1 ? 's' : ''}</span>
                    <span>{formatRelative(story.updatedAt)}</span>
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

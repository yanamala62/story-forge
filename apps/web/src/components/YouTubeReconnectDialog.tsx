import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settingsApi } from '@/lib/api';

/**
 * "Reconnect YouTube" — click Reconnect, we open Google's consent screen in a
 * new tab (out-of-band flow, same as scripts/youtube-auth.mjs), Google shows
 * an authorization code on-screen, the user pastes it back here. No redirect
 * URI needs to be registered in Google Cloud Console for this to work.
 */
export function YouTubeReconnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');

  const authUrlQuery = useQuery({
    queryKey: ['youtube-auth-url'],
    queryFn: settingsApi.getYouTubeAuthUrl,
    enabled: open,
    staleTime: 0,
  });

  const exchangeMutation = useMutation({
    mutationFn: (c: string) => settingsApi.exchangeYouTubeCode(c),
    onSuccess: () => {
      setCode('');
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ['health'] });
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCode('');
      exchangeMutation.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconnect YouTube</DialogTitle>
          <DialogDescription>
            Open the Google sign-in page, approve access, then paste the code Google shows you back here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={!authUrlQuery.data}
            onClick={() => window.open(authUrlQuery.data!.url, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-4 w-4" />
            {authUrlQuery.isLoading ? 'Preparing sign-in link…' : '1. Open Google sign-in'}
          </Button>

          <div className="space-y-2">
            <Label htmlFor="youtube-code">2. Paste the code from Google</Label>
            <Input
              id="youtube-code"
              placeholder="4/0AeaYSHC..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {exchangeMutation.isError && (
            <p className="text-sm text-destructive">
              {(exchangeMutation.error as Error).message}
            </p>
          )}

          <Button
            type="button"
            className="w-full gap-2"
            disabled={!code.trim() || exchangeMutation.isPending}
            onClick={() => exchangeMutation.mutate(code.trim())}
          >
            {exchangeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

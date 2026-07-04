import { Badge } from '@/components/ui/badge';

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'secondary' | 'outline' }> = {
  PUBLISHED:           { label: 'Published',          variant: 'success' },
  PENDING:             { label: 'Pending',             variant: 'outline' },
  GENERATING_STORY:    { label: 'Generating Story',    variant: 'info' },
  GENERATING_SCENES:   { label: 'Scenes Ready',        variant: 'info' },
  GENERATING_PROMPTS:  { label: 'Generating Prompts',  variant: 'info' },
  GENERATING_IMAGES:   { label: 'Generating Images',   variant: 'info' },
  GENERATING_AUDIO:    { label: 'Generating Audio',    variant: 'info' },
  GENERATING_SUBTITLES:{ label: 'Generating Subtitles',variant: 'info' },
  COMPOSING_VIDEO:     { label: 'Composing Video',     variant: 'warning' },
  GENERATING_SEO:      { label: 'Generating SEO',      variant: 'warning' },
  UPLOADING:           { label: 'Uploading',           variant: 'warning' },
  FAILED:              { label: 'Failed',              variant: 'destructive' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

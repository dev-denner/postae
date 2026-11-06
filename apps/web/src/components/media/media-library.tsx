import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Film,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, getApiError } from '@/lib/api';
import { formatBytes } from '@/lib/utils';

interface MediaItem {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  status: string;
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  folder?: string;
  tags: string[];
  createdAt?: string;
}

export function MediaLibrary() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const mediaQuery = useQuery({
    queryKey: ['media', 'list'],
    queryFn: async () => {
      const response = await api.get('/media', { params: { limit: 100 } });
      return (response.data?.data ?? response.data) as MediaItem[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/media/external-url', {
        url: url.trim(),
        kind,
        mimeType: kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
      });
      return (response.data?.data ?? response.data) as MediaItem;
    },
    onSuccess: async () => {
      setUrl('');
      setShowForm(false);
      setNotice({ type: 'success', message: 'Mídia cadastrada por URL pública.' });
      await queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (error) =>
      setNotice({
        type: 'error',
        message: getApiError(error, 'Não foi possível cadastrar a mídia.'),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/media/${id}`);
    },
    onSuccess: async () => {
      setNotice({ type: 'success', message: 'Mídia excluída.' });
      await queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (error) =>
      setNotice({
        type: 'error',
        message: getApiError(error, 'Não foi possível excluir a mídia.'),
      }),
  });

  const items = mediaQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.mimeType.toLowerCase().includes(term) ||
        item.folder?.toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.toLowerCase().includes(term)) ||
        item.url.toLowerCase().includes(term),
    );
  }, [items, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setNotice(null);
    addMutation.mutate();
  }

  function remove(item: MediaItem) {
    const confirmed = window.confirm(
      'Excluir esta mídia? Se ela estiver vinculada a um post, a exclusão será bloqueada.',
    );
    if (confirmed) deleteMutation.mutate(item.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca de Mídia</h1>
          <p className="text-sm text-muted-foreground">
            Mídias cadastradas por URL pública. O upload direto ainda não está implementado.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled
            title="Upload direto depende de storage público integrado; use URL pública."
          >
            <Upload className="h-4 w-4" /> Upload indisponível
          </Button>
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Fechar' : 'Adicionar URL'}
          </Button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1 space-y-2">
                <label className="text-sm font-medium" htmlFor="media-url">
                  URL pública da mídia
                </label>
                <Input
                  id="media-url"
                  placeholder="https://cdn.exemplo.com/imagem.jpg"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="media-kind">
                  Tipo
                </label>
                <select
                  id="media-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as 'IMAGE' | 'VIDEO')}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="IMAGE" className="bg-background">
                    Imagem
                  </option>
                  <option value="VIDEO" className="bg-background">
                    Vídeo
                  </option>
                </select>
              </div>
              <Button type="submit" disabled={addMutation.isPending || !url.trim()}>
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Cadastrar
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              A URL precisa ser pública e acessível pelas plataformas. Endereços locais e de rede
              interna são bloqueados. O arquivo não é copiado para o Postaê.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por tipo, pasta, tag ou URL..."
          className="pl-8"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {mediaQuery.isLoading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando mídias...
        </div>
      )}

      {mediaQuery.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {getApiError(mediaQuery.error, 'Não foi possível carregar a biblioteca.')}
        </div>
      )}

      {!mediaQuery.isLoading && !mediaQuery.error && !items.length && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <ImagePlus className="mx-auto mb-3 h-10 w-10" />
          <p>Nenhuma mídia cadastrada.</p>
          <p>Adicione uma URL pública para usar em publicações.</p>
        </div>
      )}

      {!mediaQuery.isLoading && items.length > 0 && !filtered.length && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma mídia encontrada para esta busca.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-0">
              <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted">
                {item.kind === 'VIDEO' ? (
                  <Film className="h-10 w-10 text-muted-foreground" />
                ) : (
                  <>
                    <ImagePlus className="absolute h-10 w-10 text-muted-foreground" />
                    <img
                      src={item.url}
                      alt=""
                      className="relative h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  </>
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 h-8 w-8"
                  aria-label="Excluir mídia"
                  onClick={() => remove(item)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {item.kind === 'VIDEO' ? 'Vídeo' : 'Imagem'}
                  </p>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{item.mimeType}</p>
                <p className="text-xs text-muted-foreground">
                  {item.folder || 'Sem pasta'}
                  {item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ''}
                </p>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

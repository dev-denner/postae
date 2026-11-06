# Postaê — SaaS de Agendamento e Publicação Multirrede Social

Plataforma web para conectar contas, criar, agendar e publicar conteúdo em múltiplas redes sociais (Instagram, Facebook, Threads, X, TikTok e YouTube), com seleção de vários destinos por publicação e upload de arquivos locais.

## Estrutura

```
.
├── apps/
│   ├── api/   # NestJS + Prisma + PostgreSQL + Redis + BullMQ
│   └── web/   # React + Vite + Tailwind + shadcn/ui + Zustand
├── scripts/   # runner de CLIs (compatível com volumes NTFS sem bit +x)
├── layout/    # Mockups de referência
└── docker-compose.yml
```

## Como rodar

Pré-requisitos: Node 20+, npm, Docker (opcional).

### 1. Sem Docker (dev local)

```bash
# 1) Copie as variáveis de ambiente
cp .env.example .env

# 2) Suba apenas banco e redis
docker compose up postgres redis -d

# 3) Instale dependências
npm install

# 4) Banco + seed com dados de demonstração
npm run db:push
npm run db:seed

# 5) API (terminal 1)
npm run dev:api

# 6) Web (terminal 2)
npm run dev
```

Acesse:
- Web: http://localhost:5173
- API: http://localhost:3001 (ex.: `GET /api`)
- Login de demonstração (somente seed de desenvolvimento): `demo@postae.io`

> Uploads locais são gravados em `UPLOAD_DIR` (padrão `apps/api/uploads` no dev e `/app/uploads` no Docker). O diretório é ignorado pelo Git.

### 2. Com Docker (tudo containerizado)

`docker compose up -d` inicia **PostgreSQL**, **Redis**, **API** e **Web**. Os uploads ficam no volume nomeado `uploadsdata`, montado em `/app/uploads`.

```bash
docker compose up -d
docker compose down
# rebuild após mudanças de código
docker compose up -d --build
```

## Upload e armazenamento de mídia

- `POST /api/media/upload` recebe `multipart/form-data` no campo `file` (imagem JPEG/PNG/WebP/GIF ou vídeo MP4/MOV/WebM).
- A validação confere MIME, extensão, assinatura binária (magic bytes) e limites configuráveis (`MAX_IMAGE_UPLOAD_MB`, `MAX_VIDEO_UPLOAD_MB`).
- O arquivo é salvo em storage local persistente fora do Git, com metadados no banco (`storageDriver`, `storageKey`, `originalName`, `checksum`).
- A biblioteca de mídia e a criação/edição de posts permitem **selecionar arquivos do computador**; URLs externas continuam disponíveis como opção secundária.
- O acesso a arquivos locais usa **URL assinada com HMAC e expiração** (`GET /api/media/files/:id?exp=...&sig=...`), sem expor caminhos internos.
- `MEDIA_PUBLIC_BASE_URL` define a base pública das URLs. Sem ela, o preview local funciona, mas redes que exigem URL pública (Instagram e Threads) não conseguem buscar a mídia.

### Mecanismo usado por rede

| Rede | Upload local | Mecanismo |
|---|---|---|
| X | Sim | Upload oficial de imagem via `POST /2/media/upload` (multipart) |
| Facebook | Sim | Upload direto multipart de foto/vídeo na Graph API (`/photos`, `/videos`) |
| TikTok | Sim | `FILE_UPLOAD` com upload em chunks (`Content-Range`) |
| YouTube | Sim | Upload resumable oficial (`videos.insert`) |
| Instagram | Depende de URL pública | Content Publishing exige `image_url`/`video_url` acessível pela internet |
| Threads | Depende de URL pública | Publicação exige `image_url`/`video_url` acessível pela internet |

O storage segue uma interface pequena (`MediaStorageService`) com operações de salvar, ler/remover e gerar URL. O driver local é o padrão validado neste repositório; a substituição por S3 compatível em produção é um ponto de extensão documentado, não uma funcionalidade validada aqui.

## OAuth e contas

- OAuth oficial por conta, com `state` de uso único e PKCE quando aplicável (X e TikTok).
- Tokens são persistidos **criptografados** e nunca retornam ao frontend, aos logs ou às respostas da API.
- É possível conectar **várias contas da mesma rede**; cada Página do Facebook vira uma conta separada. Perfis pessoais do Facebook não são suportados.
- A tela de Configurações permite conectar, reconectar, renovar e desconectar, mostrando rede, nome, estado e expiração.
- Desconectar limpa os tokens, marca a conta como `DISCONNECTED` e preserva o histórico.

### Status real das integrações

Nenhuma integração foi validada contra as APIs reais neste ambiente: todos os provedores estão `configured:false` porque não há Client IDs/Secrets oficiais, callbacks públicos e aprovações externas. O código implementa os fluxos oficiais, mas a publicação ao vivo depende de:

- **Meta (Instagram/Facebook/Threads):** App Review, Advanced Access, verificação de negócio e, para Instagram/Threads, URL pública de mídia.
- **X:** conta de desenvolvedor aprovada, OAuth 2.0 configurado e acesso/créditos à API. Vídeo no X não está habilitado nesta versão.
- **TikTok:** app com Content Posting API, escopo `video.publish`, auditoria para publicação pública e conta privada durante o período de sandbox. Sem auditoria, a publicação tende a `SELF_ONLY`.
- **YouTube:** projeto no Google Cloud com YouTube Data API v3, tela de consentimento e verificação OAuth; cotas e auditoria podem limitar uso.

## Publicação e destinos

```
Usuário escolhe contas → agenda → fila BullMQ → validação por destino →
publicação individual → resultado por conta (sucesso/falha/id/erro)
```

- `PostDestination` é a fonte de verdade dos destinos; `Post.socialAccountId` é legado.
- Status por destino: `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`, `SKIPPED`.
- Status do post: `DRAFT`, `SCHEDULED`, `PROCESSING`, `PUBLISHED`, `PARTIAL`, `FAILED`, `CANCELLED`.
- A falha de uma conta não esconde o resultado das demais.
- Retry manual reprocessa destinos `FAILED`; reagendamento também reseta `SKIPPED`.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe o frontend |
| `npm run dev:api` | Sobe a API em modo watch |
| `npm run build` | Build de API + Web |
| `npm run db:push` | Aplica o schema Prisma (aditivo; preserva dados) |
| `npm run db:seed` | Popula dados de demonstração |
| `npm run test --workspace=apps/api` | Testes da API |
| `npm run typecheck --workspace=apps/web` | Typecheck do frontend |

Os scripts npm invocam os CLIs via `scripts/run-bin.mjs`, que localiza o pacote no `node_modules` e roda o JS com `node`. Isso evita depender do bit de execução de `node_modules/.bin` em volumes NTFS (`fmask` remove `+x`) e funciona também nos Dockerfiles.

## Limitações conhecidas

- Instagram e Threads exigem `MEDIA_PUBLIC_BASE_URL` público para publicar uploads locais.
- X aceita texto até 280 caracteres e até 4 imagens; vídeo ainda não está habilitado.
- TikTok e YouTube exigem vídeo.
- O driver S3 compatível não foi implementado/validado; somente o storage local é funcional.
- `npm audit` reporta vulnerabilidades transitivas; correções automáticas exigiriam `--force` com breaking changes e não foram aplicadas.
- Nenhuma publicação real foi executada sem credenciais e aprovações das plataformas.

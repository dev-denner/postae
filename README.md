# Postaê — SaaS de Agendamento e Publicação Multirrede Social

Plataforma web moderna para gerenciamento, agendamento e publicação de conteúdo em múltiplas redes sociais (Instagram, Facebook, Threads, X, TikTok, YouTube), com UX premium inspirada em Notion/Linear/Stripe e arquitetura extensível.

## Estrutura

```
.
├── apps/
│   ├── api/   # NestJS + Prisma + PostgreSQL + Redis + BullMQ
│   └── web/   # React + Vite + Tailwind + shadcn/ui + Zustand
├── layout/    # Mockups de referência (Dashboard, Criar post, Calendário, Contas)
└── docker-compose.yml
```

## Como rodar

Pré-requisitos: Node 20+, npm, Docker (opcional).

### 1. Sem Docker (dev local)

```bash
# 1) Copie as variáveis de ambiente
copy .env.example .env

# 2) Suba apenas banco/redis/minio (ou use Docker Desktop com PostgreSQL local)
docker compose up postgres redis minio -d

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
- API / Swagger: http://localhost:3001/docs
- MinIO: http://localhost:9001 (minio / minio1234)

### 2. Com Docker (tudo containerizado)

```bash
docker compose up --build
```

## Arquitetura

Backend modular (NestJS):

- `AuthModule` — JWT + Refresh Token, OAuth2
- `UsersModule`, `MediaModule` (S3/MinIO, upload/drag-and-drop)
- `CalendarModule`, `PostsModule`, `SchedulerModule` (BullMQ + Redis)
- `InstagramModule`, `FacebookModule`, `ThreadsModule`, `TwitterModule`, `TikTokModule`, `YoutubeModule`
- `AnalyticsModule`, `BillingModule`, `NotificationsModule`

Cada rede implementa a mesma interface:

```ts
interface SocialProvider {
  publish(post: Post): Promise<PostResult>;
  schedule(post: Post): Promise<void>;
  delete(postId: string): Promise<void>;
  getStatus(postId: string): Promise<PostStatus>;
}
```

Novas redes (LinkedIn, Pinterest, Telegram etc.) entram como novos módulos sem alterar os existentes.

## Fluxo de publicação

```
Usuário agenda → Fila BullMQ → Validação → Processamento →
Publicação por provider → PublicationLog + Notificação
```

Status: `Rascunho`, `Agendado`, `Em processamento`, `Publicado`, `Falhou`, `Cancelado`.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe o frontend |
| `npm run dev:api` | Sobe a API em modo watch |
| `npm run db:push` | Aplica o schema Prisma |
| `npm run db:seed` | Popula com workspace Studio Aurora e dados dos mockups |
| `npm run build` | Build de API + Web |

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@postae.io' },
    update: {},
    create: {
      email: 'demo@postae.io',
      passwordHash: await bcrypt.hash('demo123456', 10),
      name: 'Denner',
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'studio-aurora' },
    update: {},
    create: { name: 'Studio Aurora', slug: 'studio-aurora', industry: 'Moda & Lifestyle' },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
  });

  // Remove apenas as contas fictícias criadas por seeds antigos. Contas reais
  // conectadas via OAuth nunca usam este token de exemplo.
  await prisma.socialAccount.deleteMany({
    where: {
      workspaceId: workspace.id,
      accessToken: { in: ['encrypted-token-mock', 'mock-token', 'dev-token'] },
    },
  });

  const postCount = await prisma.post.count({ where: { workspaceId: workspace.id } });
  if (postCount === 0) {
    await prisma.post.createMany({
      data: [
        {
          workspaceId: workspace.id,
          status: 'DRAFT',
          content: {
            title: 'Bem-vindo ao Postaê',
            text: 'Conecte uma conta social em Configurações para começar a publicar.',
            hashtags: ['postae'],
          },
          mediaIds: [],
        },
        {
          workspaceId: workspace.id,
          status: 'DRAFT',
          content: {
            title: 'Ideia de lançamento',
            text: 'Rascunho de exemplo. Edite, escolha as contas e agende.',
            hashtags: ['lancamento'],
          },
          mediaIds: [],
        },
      ],
    });
  }

  console.log('Seed concluído', { user: user.email, workspace: workspace.slug });
  console.log(
    'Nenhuma conta social fictícia foi criada. Acesse Configurações > Contas sociais e conecte via OAuth.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

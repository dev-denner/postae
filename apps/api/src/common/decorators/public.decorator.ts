import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca rotas que não exigem JWT (ex.: callback OAuth, que é aberto pelo
 * navegador e protegido pelo parâmetro state de uso único).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

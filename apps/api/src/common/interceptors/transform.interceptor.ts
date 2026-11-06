import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: any) => {
        // Controllers que já usam o envelope padrão { data, meta? } não
        // devem ser envolvidos duas vezes.
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const keys = Object.keys(data);
          if (
            keys.includes('data') &&
            keys.every((key) => key === 'data' || key === 'meta')
          ) {
            return data as ApiResponse<T>;
          }
        }
        return { data } as ApiResponse<T>;
      }),
    );
  }
}

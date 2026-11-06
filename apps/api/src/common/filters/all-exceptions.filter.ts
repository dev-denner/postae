import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../dto/error-response.dto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.normalize(exception);

    const body: ApiErrorResponse = {
      statusCode,
      error: error || 'INTERNAL_ERROR',
      message: message || 'Erro interno inesperado',
      code: this.extractCode(exception),
      timestamp: new Date().toISOString(),
      path: request?.url,
    };

    if (statusCode >= 500) {
      // Evita vazar detalhes internos em produção
      const safeMessage = process.env.NODE_ENV === 'production' ? 'Erro interno inesperado' : message;
      body.message = safeMessage ?? body.message;
    }

    response.status(statusCode).json(body);
  }

  private normalize(exception: unknown): {
    statusCode: number;
    message?: string;
    error?: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = this.extractMessage(exception) || exception.message;
      const error =
        typeof response === 'string'
          ? 'Error'
          : String((response as Record<string, unknown>).error ?? 'Error');
      return { statusCode: status, message, error };
    }

    const message = exception instanceof Error ? exception.message : 'Unknown error';
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const error = 'INTERNAL_ERROR';
    return { statusCode: status, message, error };
  }

  private extractMessage(exception: HttpException): string | undefined {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const msg = (response as Record<string, unknown>).message;
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg) && msg.length) return msg[0];
    }
    return exception.message;
  }

  private extractCode(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse() as Record<string, unknown>;
      if (response?.code) return String(response.code);
    }
    return 'INTERNAL_ERROR';
  }
}

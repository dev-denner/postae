export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code: string;
  timestamp: string;
  path?: string;
}

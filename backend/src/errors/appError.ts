// Error de negocio con su código HTTP. El errorMiddleware lo convierte en { error, field }.
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

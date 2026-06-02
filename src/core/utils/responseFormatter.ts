export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    timestamp: string;
    usedModules?: string[];
  };
}

export function successResponse<T>(
  data: T,
  usedModules?: string[],
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...(usedModules && { usedModules }),
    },
  };
}

export function errorResponse(error: string): ApiResponse {
  return {
    success: false,
    error,
    meta: { timestamp: new Date().toISOString() },
  };
}

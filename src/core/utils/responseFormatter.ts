export type ErrorType = "DEVELOPER" | "SERVER" | "CLIENT" | "NETWORK" | "USER_OPERATIONAL";
export type ErrorAction = "RETRY" | "ROUTE_BILLING" | "ROUTE_LOGIN" | "CONTACT_SUPPORT" | "FIX_INPUT" | "WAIT" | "NONE";

export interface ApiErrorDetail {
  type: ErrorType;
  code: string;
  user_message: string;
  dev_message?: string;
  next_action: ErrorAction;
  retryable: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | ApiErrorDetail;
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

export function errorResponse(errorDetail: string | ApiErrorDetail): ApiResponse {
  return {
    success: false,
    error: errorDetail,
    meta: { timestamp: new Date().toISOString() },
  };
}

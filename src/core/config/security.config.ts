import { env } from './env.config';

/**
 * Security configurations for Admin Authentication and general app protection.
 */
export const securityConfig = {
  adminAuth: {
    // Maximum number of failed OTP attempts before lockout
    MAX_FAILED_ATTEMPTS: 3,
    
    // Duration for which the admin account will be locked out (15 minutes)
    LOCKOUT_DURATION_MS: 15 * 60 * 1000,
    
    // Expiration time for an OTP (5 minutes)
    OTP_EXPIRY_MS: 5 * 60 * 1000,
  }
};

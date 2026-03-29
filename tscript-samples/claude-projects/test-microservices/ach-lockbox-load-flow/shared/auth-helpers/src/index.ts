/**
 * JWT Authentication and RBAC Helpers
 * JWT token validation, claim extraction, and role-based access control
 */

import jwt, { Algorithm, JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '@ach-lockbox/error-taxonomy';

// ============================================================================
// JWT TYPES AND INTERFACES
// ============================================================================

/**
 * Decoded JWT token claims
 * RS256 signature with standard and custom claims
 */
export interface DecodedToken {
  sub: string;           // Subject (user ID)
  role: Role;            // User's role
  entityId: string;      // Associated entity (carrier, factor, broker, etc.)
  email?: string;        // User email
  name?: string;         // User name
  iat: number;           // Issued at (seconds since epoch)
  exp: number;           // Expires at (seconds since epoch)
  iss?: string;          // Issuer
  aud?: string;          // Audience
}

/**
 * User roles in the system
 * Controls access to different service operations
 */
export type Role = 'broker-admin' | 'factor-user' | 'carrier-user' | 'system' | 'read-only';

/**
 * RBAC policy defining who can access what
 */
export interface RBACPolicy {
  allowedRoles: Role[];      // Roles that can perform action
  allowedEntities?: string[]; // Specific entity IDs allowed (optional)
  requireAdmin?: boolean;    // Must be broker-admin?
}

// ============================================================================
// JWT VALIDATION
// ============================================================================

/**
 * JWT validation options
 */
export interface JWTValidationOptions {
  publicKey: string;
  issuer: string;
  audience: string;
  algorithms?: Algorithm[];
}

/**
 * Validate and decode JWT token
 * Throws UnauthorizedError if invalid
 */
export function validateAndDecodeToken(
  token: string,
  options: JWTValidationOptions
): DecodedToken {
  try {
    const decoded = jwt.verify(token, options.publicKey, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: options.algorithms || ['RS256'],
    }) as JwtPayload | string;

    if (typeof decoded === 'string') {
      throw new UnauthorizedError('Token payload is not an object');
    }

    const role = decoded.role as Role | undefined;
    const entityId = decoded.entityId as string | undefined;
    const sub = decoded.sub as string | undefined;

    if (!role || !entityId || !sub || !decoded.iat || !decoded.exp) {
      throw new UnauthorizedError('Token missing required claims');
    }

    return {
      sub,
      role,
      entityId,
      email: decoded.email as string | undefined,
      name: decoded.name as string | undefined,
      iat: decoded.iat,
      exp: decoded.exp,
      iss: decoded.iss,
      aud: Array.isArray(decoded.aud) ? decoded.aud.join(',') : decoded.aud,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    throw new UnauthorizedError(`Token validation failed: ${message}`);
  }
}

/**
 * Extract JWT token from Authorization header
 * Supports "Bearer <token>" format
 */
export function extractTokenFromHeader(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new UnauthorizedError('Missing Authorization header');
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new UnauthorizedError('Invalid Authorization header format. Expected: Bearer <token>');
  }
  
  return parts[1];
}

// ============================================================================
// RBAC ENFORCEMENT
// ============================================================================

/**
 * Check if user's role is authorized by policy
 */
export function isRoleAuthorized(userRole: Role, policy: RBACPolicy): boolean {
  if (policy.requireAdmin && userRole !== 'broker-admin') {
    return false;
  }
  
  return policy.allowedRoles.includes(userRole);
}

/**
 * Check if user's entity is authorized by policy
 */
export function isEntityAuthorized(userEntityId: string, policy: RBACPolicy): boolean {
  if (!policy.allowedEntities || policy.allowedEntities.length === 0) {
    return true; // No entity restrictions
  }
  
  return policy.allowedEntities.includes(userEntityId);
}

/**
 * Enforce RBAC policy against decoded token
 * Throws UnauthorizedError if not authorized
 */
export function enforceRBACPolicy(token: DecodedToken, policy: RBACPolicy): void {
  if (!isRoleAuthorized(token.role, policy)) {
    throw new UnauthorizedError(
      `Insufficient role: ${token.role}. Required roles: ${policy.allowedRoles.join(', ')}`
    );
  }
  
  if (!isEntityAuthorized(token.entityId, policy)) {
    throw new UnauthorizedError(
      `Unauthorized entity: ${token.entityId}`
    );
  }
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Express request with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user?: DecodedToken;
  correlationId?: string;
}

/**
 * Create authentication middleware
 * Validates JWT and attaches decoded token to request
 */
export function createAuthMiddleware(options: JWTValidationOptions) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const token = extractTokenFromHeader(authHeader);
      const decoded = validateAndDecodeToken(token, options);
      
      req.user = decoded;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      res.status(401).json({ error: 'Unauthorized', message });
    }
  };
}

/**
 * Create RBAC enforcement middleware for specific policy
 * Must be used AFTER createAuthMiddleware
 */
export function createRBACMiddleware(policy: RBACPolicy) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      enforceRBACPolicy(req.user, policy);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authorization failed';
      res.status(403).json({ error: 'Forbidden', message });
    }
  };
}

// ============================================================================
// RBAC POLICIES (Predefined for Common Scenarios)
// ============================================================================

export const RBAC_POLICIES = {
  /**
   * Admin operations (broker-admin only)
   */
  ADMIN_ONLY: {
    allowedRoles: ['broker-admin'],
    requireAdmin: true,
  } as RBACPolicy,
  
  /**
   * Service-to-service calls (system role)
   */
  SERVICE_ONLY: {
    allowedRoles: ['system'],
  } as RBACPolicy,
  
  /**
   * User operations (any authenticated user)
   */
  AUTHENTICATED_USERS: {
    allowedRoles: ['broker-admin', 'factor-user', 'carrier-user'],
  } as RBACPolicy,
  
  /**
   * Read-only access (all roles)
   */
  READ_ONLY: {
    allowedRoles: ['broker-admin', 'factor-user', 'carrier-user', 'read-only', 'system'],
  } as RBACPolicy,
  
  /**
   * Carrier-specific operations (carrier user OR broker admin)
   */
  CARRIER_OR_ADMIN: {
    allowedRoles: ['carrier-user', 'broker-admin'],
  } as RBACPolicy,
  
  /**
   * Factor-specific operations (factor user OR broker admin)
   */
  FACTOR_OR_ADMIN: {
    allowedRoles: ['factor-user', 'broker-admin'],
  } as RBACPolicy,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create RBAC policy for entity-scoped access
 * User can only access their own entity (unless admin)
 */
export function createEntityScopedPolicy(entityIds?: string[]): RBACPolicy {
  return {
    allowedRoles: ['broker-admin', 'factor-user', 'carrier-user'],
    allowedEntities: entityIds,
  };
}

/**
 * Create RBAC policy with admin override
 */
export function createAdminOverridePolicy(
  basePolicy: RBACPolicy
): RBACPolicy {
  return {
    ...basePolicy,
    allowedRoles: [...basePolicy.allowedRoles, 'broker-admin'],
  };
}

/**
 * Check if request is from internal service
 */
export function isServiceRequest(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'system';
}

/**
 * Check if request is from admin
 */
export function isAdminRequest(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'broker-admin';
}

/**
 * Get user entity ID from request (with fallback)
 */
export function getUserEntityId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  return req.user.entityId;
}

/**
 * Validate user can access entity
 * Returns true if user is admin OR owns entity
 */
export function canAccessEntity(req: AuthenticatedRequest, entityId: string): boolean {
  if (!req.user) {
    return false;
  }
  
  if (req.user.role === 'broker-admin') {
    return true;
  }
  
  return req.user.entityId === entityId;
}

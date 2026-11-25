import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, CompanySettings } from '../models';
import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey, type RoleType } from '../config/permissions';

let runtimeFallbackSecret: string | null = null;

export function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret) return envSecret;
  if (!runtimeFallbackSecret) {
    runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');
  }
  return runtimeFallbackSecret;
}

export interface AuthUserContext {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: RoleType;
  assignedWarehouseId: string | null;
  preferredLanguage: 'so' | 'en';
  permissions: Set<string>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserContext;
    }
  }
}

export function signAuthToken(userId: string, role: RoleType): string {
  return jwt.sign({ sub: userId, role }, getJwtSecret(), { expiresIn: '12h' });
}

export async function resolveEffectivePermissions(
  role: RoleType,
  customPermissions?: Record<string, boolean>
): Promise<Set<string>> {
  const settings = await CompanySettings.findOne({ singletonKey: 'PRIMARY' }).lean();
  const matrix = (settings?.rolePermissions as Record<string, string[]>) || DEFAULT_ROLE_PERMISSIONS;
  const basePerms = new Set<string>(matrix[role] || DEFAULT_ROLE_PERMISSIONS[role] || []);

  if (role === 'SUPER_ADMIN') {
    for (const p of DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN) {
      basePerms.add(p);
    }
  }

  if (customPermissions && typeof customPermissions === 'object') {
    for (const [key, enabled] of Object.entries(customPermissions)) {
      if (enabled === true) basePerms.add(key);
      if (enabled === false && role !== 'SUPER_ADMIN') basePerms.delete(key);
    }
  }

  return basePerms;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const decoded = jwt.verify(token, getJwtSecret()) as { sub?: string };
    if (!decoded?.sub || !mongoose.Types.ObjectId.isValid(decoded.sub)) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const user = await User.findById(decoded.sub).lean();
    if (!user || user.accountStatus !== 'Active') {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    const permissions = await resolveEffectivePermissions(
      user.role as RoleType,
      (user.customPermissions as Record<string, boolean>) || {}
    );

    req.user = {
      id: String(user._id),
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      role: user.role as RoleType,
      assignedWarehouseId: user.assignedWarehouseId ? String(user.assignedWarehouseId) : null,
      preferredLanguage: (user.preferredLanguage as 'so' | 'en') || 'so',
      permissions,
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }
}

export function requirePermission(...required: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    const allowed = required.some((perm) => req.user!.permissions.has(perm));
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient role permissions for this operation' });
    }
    return next();
  };
}

export function canAccessAllWarehouses(user: AuthUserContext): boolean {
  return (
    user.role === 'SUPER_ADMIN' ||
    user.role === 'GENERAL_MANAGER' ||
    user.role === 'ACCOUNTANT' ||
    user.permissions.has('WAREHOUSE_VIEW_ALL')
  );
}

export function assertWarehouseAccess(
  user: AuthUserContext,
  warehouseId: string | mongoose.Types.ObjectId | null | undefined
): void {
  if (canAccessAllWarehouses(user)) return;
  if (!user.assignedWarehouseId) {
    throw Object.assign(new Error('No warehouse assigned to your account'), { statusCode: 403 });
  }
  if (!warehouseId || String(warehouseId) !== user.assignedWarehouseId) {
    throw Object.assign(new Error('Access denied for this warehouse'), { statusCode: 403 });
  }
}

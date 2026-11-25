import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Warehouse } from '../models';
import { authenticate, signAuthToken, resolveEffectivePermissions } from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { seedStarterOperationalData, ensureBaseSettings } from '../services/seedService';
import { asyncHandler, validateBody } from '../utils/validation';
import type { RoleType } from '../config/permissions';

const router = Router();

const bootstrapSchema = z.object({
  fullName: z.string().min(2).max(120),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  initializeStarterData: z.boolean().optional().default(true),
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(120),
  password: z.string().min(1).max(128),
});

router.get(
  '/bootstrap-status',
  asyncHandler(async (_req, res) => {
    await ensureBaseSettings();
    const superAdminCount = await User.countDocuments({ role: 'SUPER_ADMIN' });
    res.json({ needsBootstrap: superAdminCount === 0 });
  })
);

router.post(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const existingAdmin = await User.countDocuments({ role: 'SUPER_ADMIN' });
    if (existingAdmin > 0) {
      return res.status(403).json({ error: 'System is already initialized. Please sign in.' });
    }

    const data = validateBody(bootstrapSchema, req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await User.create({
      fullName: data.fullName.trim(),
      username: data.username.trim().toLowerCase(),
      email: data.email.trim().toLowerCase(),
      passwordHash,
      role: 'SUPER_ADMIN',
      accountStatus: 'Active',
      preferredLanguage: 'so',
      lastLoginAt: new Date(),
    });

    if (data.initializeStarterData) {
      await seedStarterOperationalData(user._id);
    } else {
      await ensureBaseSettings();
    }

    await recordAuditLog({
      actor: { id: String(user._id), fullName: user.fullName, role: user.role },
      action: 'INITIALIZE_SYSTEM',
      entityType: 'User',
      entityId: String(user._id),
      entityRef: user.username,
      details: { starterDataSeeded: data.initializeStarterData },
      ipAddress: req.ip || '',
    });

    const token = signAuthToken(String(user._id), 'SUPER_ADMIN');
    const perms = await resolveEffectivePermissions('SUPER_ADMIN', {});

    res.status(201).json({
      token,
      user: {
        id: String(user._id),
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        assignedWarehouseId: null,
        assignedWarehouseName: null,
        preferredLanguage: user.preferredLanguage,
        permissions: Array.from(perms),
      },
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = validateBody(loginSchema, req.body);
    const idLower = data.identifier.trim().toLowerCase();

    const user = await User.findOne({
      $or: [{ username: idLower }, { email: idLower }],
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.accountStatus !== 'Active') {
      return res.status(403).json({ error: 'Account is suspended or inactive' });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const warehouse = user.assignedWarehouseId
      ? await Warehouse.findById(user.assignedWarehouseId).lean()
      : null;

    const perms = await resolveEffectivePermissions(
      user.role as RoleType,
      (user.customPermissions as Record<string, boolean>) || {}
    );

    await recordAuditLog({
      actor: { id: String(user._id), fullName: user.fullName, role: user.role },
      action: 'LOGIN',
      entityType: 'User',
      entityId: String(user._id),
      entityRef: user.username,
      warehouseId: user.assignedWarehouseId,
      ipAddress: req.ip || '',
    });

    const token = signAuthToken(String(user._id), user.role as RoleType);

    res.json({
      token,
      user: {
        id: String(user._id),
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        assignedWarehouseId: user.assignedWarehouseId ? String(user.assignedWarehouseId) : null,
        assignedWarehouseName: warehouse?.name || null,
        preferredLanguage: user.preferredLanguage || 'so',
        permissions: Array.from(perms),
      },
    });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const warehouse = u.assignedWarehouseId
      ? await Warehouse.findById(u.assignedWarehouseId).lean()
      : null;
    res.json({
      user: {
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        role: u.role,
        assignedWarehouseId: u.assignedWarehouseId,
        assignedWarehouseName: warehouse?.name || null,
        preferredLanguage: u.preferredLanguage,
        permissions: Array.from(u.permissions),
      },
    });
  })
);

router.patch(
  '/language',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = validateBody(z.object({ language: z.enum(['so', 'en']) }), req.body);
    await User.findByIdAndUpdate(req.user!.id, { preferredLanguage: body.language });
    res.json({ language: body.language });
  })
);

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      }),
      req.body
    );

    const user = await User.findById(req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    user.passwordHash = await bcrypt.hash(body.newPassword, 12);
    await user.save();

    await recordAuditLog({
      actor: req.user!,
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: String(user._id),
      entityRef: user.username,
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Password updated successfully' });
  })
);

export default router;

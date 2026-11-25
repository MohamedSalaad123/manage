import { Router } from 'express';
import { z } from 'zod';
import { CompanySettings } from '../models';
import { authenticate, requirePermission } from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { ensureBaseSettings } from '../services/seedService';
import { asyncHandler, validateBody } from '../utils/validation';

const router = Router();

router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    await ensureBaseSettings();
    const s = await CompanySettings.findOne({ singletonKey: 'PRIMARY' }).lean();
    res.json({
      companyName: s?.companyName || 'KHAYRE CONSTRUCTION AND MATERIALS COMPANY',
      companyLogo: s?.companyLogo || '/src/assets/images/khayre_logo_1795416086464.jpg',
      defaultLanguage: s?.defaultLanguage || 'so',
      currency: s?.currency || 'USD',
    });
  })
);

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await ensureBaseSettings();
    const settings = await CompanySettings.findOne({ singletonKey: 'PRIMARY' }).lean();
    res.json({ settings });
  })
);

const settingsUpdateSchema = z.object({
  companyName: z.string().min(2).max(160).optional(),
  companyLogo: z.string().max(500).optional(),
  companyAddress: z.string().max(250).optional(),
  companyPhone: z.string().max(50).optional(),
  companyEmail: z.string().email().optional().or(z.literal('')),
  currency: z.string().min(2).max(10).optional(),
  defaultLanguage: z.enum(['so', 'en']).optional(),
  dateFormat: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']).optional(),
  notificationSettings: z
    .object({
      lowStockAlerts: z.boolean(),
      outOfStockAlerts: z.boolean(),
      transferAlerts: z.boolean(),
      stockInOutAlerts: z.boolean(),
    })
    .optional(),
  approvalSettings: z
    .object({
      requireTransferApproval: z.boolean(),
      requireAdjustmentApproval: z.boolean(),
      requireStockCountApproval: z.boolean(),
      allowNegativeStock: z.boolean(),
    })
    .optional(),
  rolePermissions: z.record(z.string(), z.array(z.string())).optional(),
  backupConfig: z
    .object({
      autoBackupEnabled: z.boolean(),
      frequency: z.enum(['daily', 'weekly', 'manual']),
    })
    .optional(),
});

router.put(
  '/',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(settingsUpdateSchema, req.body);
    await ensureBaseSettings();

    const updated = await CompanySettings.findOneAndUpdate(
      { singletonKey: 'PRIMARY' },
      { $set: data },
      { new: true }
    );

    await recordAuditLog({
      actor: req.user!,
      action: 'UPDATE_SETTINGS',
      entityType: 'Settings',
      entityRef: 'PRIMARY',
      details: { updatedKeys: Object.keys(data) },
      ipAddress: req.ip || '',
    });

    res.json({ settings: updated });
  })
);

router.post(
  '/backup-now',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    const updated = await CompanySettings.findOneAndUpdate(
      { singletonKey: 'PRIMARY' },
      { $set: { 'backupConfig.lastBackupAt': new Date() } },
      { new: true }
    );
    await recordAuditLog({
      actor: req.user!,
      action: 'TRIGGER_BACKUP',
      entityType: 'Settings',
      entityRef: 'BACKUP',
      ipAddress: req.ip || '',
    });
    res.json({ settings: updated });
  })
);

export default router;

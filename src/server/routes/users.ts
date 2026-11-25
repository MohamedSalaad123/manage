import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models';
import { authenticate, requirePermission } from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { asyncHandler, parseObjectId, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await User.find({ accountStatus: 'Active' })
      .select('fullName username email role assignedWarehouseId accountStatus')
      .sort({ fullName: 1 })
      .lean();
    res.json({ users });
  })
);

router.patch(
  '/:id/permissions',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'userId');
    const body = validateBody(
      z.object({ customPermissions: z.record(z.string(), z.boolean()) }),
      req.body
    );

    const updated = await User.findByIdAndUpdate(
      id,
      { customPermissions: body.customPermissions },
      { new: true }
    ).select('-passwordHash');
    if (!updated) return res.status(404).json({ error: 'User not found' });

    await recordAuditLog({
      actor: req.user!,
      action: 'UPDATE_USER_PERMISSIONS',
      entityType: 'User',
      entityId: String(updated._id),
      entityRef: updated.username,
      ipAddress: req.ip || '',
    });

    res.json({ user: updated });
  })
);

export default router;

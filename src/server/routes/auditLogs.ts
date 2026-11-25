import { Router } from 'express';
import { AuditLog } from '../models';
import { authenticate, requirePermission, canAccessAllWarehouses } from '../middleware/auth';
import { asyncHandler, parseObjectId, safeString } from '../utils/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('AUDIT_VIEW', 'SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const entityType = safeString(req.query.entityType);
    const filter: Record<string, unknown> = {};

    if (!canAccessAllWarehouses(user) && user.assignedWarehouseId) {
      filter.warehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    }
    if (entityType && entityType !== 'ALL') {
      filter.entityType = entityType;
    }

    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ logs });
  })
);

export default router;

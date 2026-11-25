import { Router } from 'express';
import mongoose from 'mongoose';
import { Notification } from '../models';
import { authenticate, canAccessAllWarehouses } from '../middleware/auth';
import { asyncHandler, parseObjectId } from '../utils/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const filter: Record<string, unknown> = {
      targetRoles: user.role,
    };
    if (!canAccessAllWarehouses(user) && user.assignedWarehouseId) {
      filter.$or = [
        { warehouseId: new mongoose.Types.ObjectId(user.assignedWarehouseId) },
        { warehouseId: null },
      ];
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('warehouseId', 'name code')
      .populate('productId', 'name sku')
      .lean();

    const userObjId = user.id;
    const enriched = notifications.map((n) => ({
      ...n,
      isRead: (n.readBy || []).some((id: unknown) => String(id) === userObjId),
    }));

    const unreadCount = enriched.filter((n) => !n.isRead).length;
    res.json({ notifications: enriched, unreadCount });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'notificationId');
    await Notification.findByIdAndUpdate(id, {
      $addToSet: { readBy: new mongoose.Types.ObjectId(req.user!.id) },
    });
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const userObjId = new mongoose.Types.ObjectId(req.user!.id);
    await Notification.updateMany(
      { targetRoles: req.user!.role },
      { $addToSet: { readBy: userObjId } }
    );
    res.json({ ok: true });
  })
);

export default router;

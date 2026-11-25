import { Router } from 'express';
import { z } from 'zod';
import {
  Warehouse,
  Inventory,
  StockTransaction,
  Employee,
} from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
  assertWarehouseAccess,
} from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { asyncHandler, escapeRegex, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const warehouseSchema = z.object({
  name: z.string().min(2).max(150),
  code: z.string().min(2).max(40),
  location: z.string().min(2).max(150),
  address: z.string().min(2).max(250),
  managerId: z.string().nullable().optional(),
  phone: z.string().min(3).max(40),
  description: z.string().max(500).optional().default(''),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const search = safeString(req.query.search);
    const status = safeString(req.query.status);

    const filter: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ warehouses: [] });
      filter._id = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    }
    if (status && ['Active', 'Inactive'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: rx }, { code: rx }, { location: rx }];
    }

    const warehouses = await Warehouse.find(filter)
      .populate('managerId', 'fullName email role')
      .sort({ createdAt: -1 })
      .lean();

    const warehouseIds = warehouses.map((w) => w._id);
    const [invAgg, empAgg] = await Promise.all([
      Inventory.aggregate([
        { $match: { warehouseId: { $in: warehouseIds } } },
        {
          $group: {
            _id: '$warehouseId',
            totalQuantity: { $sum: '$availableQty' },
            totalValue: { $sum: '$totalValue' },
            productCount: { $sum: 1 },
          },
        },
      ]),
      Employee.aggregate([
        { $match: { assignedWarehouseId: { $in: warehouseIds }, status: 'Active' } },
        { $group: { _id: '$assignedWarehouseId', count: { $sum: 1 } } },
      ]),
    ]);

    const invMap = new Map(invAgg.map((i) => [String(i._id), i]));
    const empMap = new Map(empAgg.map((e) => [String(e._id), e.count]));

    const enriched = warehouses.map((w) => {
      const stats = invMap.get(String(w._id));
      return {
        ...w,
        totalQuantity: Number((stats?.totalQuantity || 0).toFixed(2)),
        totalValue: Number((stats?.totalValue || 0).toFixed(2)),
        productCount: stats?.productCount || 0,
        employeeCount: empMap.get(String(w._id)) || 0,
      };
    });

    res.json({ warehouses: enriched });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'warehouseId');
    assertWarehouseAccess(req.user!, id);

    const warehouse = await Warehouse.findById(id)
      .populate('managerId', 'fullName email role')
      .lean();
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    const [inventory, employees, transactions] = await Promise.all([
      Inventory.find({ warehouseId: id })
        .populate({
          path: 'productId',
          populate: { path: 'categoryId', select: 'name' },
        })
        .sort({ updatedAt: -1 })
        .lean(),
      Employee.find({ assignedWarehouseId: id }).sort({ fullName: 1 }).lean(),
      StockTransaction.find({ warehouseId: id, status: 'Confirmed' })
        .sort({ transactionDate: -1 })
        .limit(50)
        .populate('productId', 'name sku unit')
        .populate('performedBy', 'fullName')
        .lean(),
    ]);

    const totalStockValue = inventory.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const totalStockQty = inventory.reduce((sum, item) => sum + (item.availableQty || 0), 0);

    res.json({
      warehouse,
      summary: {
        totalStockValue: Number(totalStockValue.toFixed(2)),
        totalStockQty: Number(totalStockQty.toFixed(2)),
        skuCount: inventory.length,
        employeeCount: employees.length,
      },
      inventory,
      employees,
      transactions,
    });
  })
);

router.post(
  '/',
  requirePermission('WAREHOUSE_MANAGE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(warehouseSchema, req.body);
    const code = data.code.trim().toUpperCase();

    const exists = await Warehouse.findOne({ code });
    if (exists) {
      return res.status(409).json({ error: `Warehouse code ${code} already exists` });
    }

    const warehouse = await Warehouse.create({
      ...data,
      code,
      managerId: data.managerId ? parseObjectId(data.managerId, 'managerId') : null,
      createdBy: req.user!.id,
    });

    await recordAuditLog({
      actor: req.user!,
      action: 'CREATE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: String(warehouse._id),
      entityRef: warehouse.code,
      warehouseId: warehouse._id,
      details: { name: warehouse.name, location: warehouse.location },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ warehouse });
  })
);

router.put(
  '/:id',
  requirePermission('WAREHOUSE_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'warehouseId');
    assertWarehouseAccess(req.user!, id);
    const data = validateBody(warehouseSchema, req.body);
    const code = data.code.trim().toUpperCase();

    const duplicate = await Warehouse.findOne({ code, _id: { $ne: id } });
    if (duplicate) {
      return res.status(409).json({ error: `Warehouse code ${code} already exists` });
    }

    const updated = await Warehouse.findByIdAndUpdate(
      id,
      {
        ...data,
        code,
        managerId: data.managerId ? parseObjectId(data.managerId, 'managerId') : null,
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Warehouse not found' });

    await recordAuditLog({
      actor: req.user!,
      action: 'UPDATE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: String(updated._id),
      entityRef: updated.code,
      warehouseId: updated._id,
      details: { name: updated.name, status: updated.status },
      ipAddress: req.ip || '',
    });

    res.json({ warehouse: updated });
  })
);

router.patch(
  '/:id/status',
  requirePermission('WAREHOUSE_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'warehouseId');
    assertWarehouseAccess(req.user!, id);
    const body = validateBody(z.object({ status: z.enum(['Active', 'Inactive']) }), req.body);

    const updated = await Warehouse.findByIdAndUpdate(id, { status: body.status }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Warehouse not found' });

    await recordAuditLog({
      actor: req.user!,
      action: body.status === 'Active' ? 'ACTIVATE_WAREHOUSE' : 'DEACTIVATE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: String(updated._id),
      entityRef: updated.code,
      warehouseId: updated._id,
      ipAddress: req.ip || '',
    });

    res.json({ warehouse: updated });
  })
);

router.delete(
  '/:id',
  requirePermission('WAREHOUSE_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'warehouseId');
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    const [hasStock, hasTransactions] = await Promise.all([
      Inventory.exists({ warehouseId: id, $or: [{ availableQty: { $gt: 0 } }, { reservedQty: { $gt: 0 } }] }),
      StockTransaction.exists({ warehouseId: id }),
    ]);

    if (hasStock || hasTransactions) {
      return res.status(400).json({
        error: 'Cannot delete a warehouse that contains stock or transaction history. Deactivate it instead.',
      });
    }

    await Warehouse.deleteOne({ _id: id });
    await recordAuditLog({
      actor: req.user!,
      action: 'DELETE_WAREHOUSE',
      entityType: 'Warehouse',
      entityId: String(id),
      entityRef: warehouse.code,
      ipAddress: req.ip || '',
    });

    res.json({ deleted: true });
  })
);

export default router;

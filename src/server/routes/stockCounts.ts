import { Router } from 'express';
import { z } from 'zod';
import { StockCount, StockAdjustment, Inventory, Product } from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
  assertWarehouseAccess,
} from '../middleware/auth';
import { runInTransaction } from '../config/db';
import {
  applyStockDecrease,
  applyStockIncrease,
  recordLedgerEntry,
} from '../services/inventoryService';
import { createNotification, recordAuditLog } from '../services/auditService';
import { generateDocumentNumber } from '../services/sequenceService';
import { asyncHandler, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const createCountSchema = z.object({
  warehouseId: z.string().min(1),
  countDate: z.string().optional(),
  notes: z.string().max(500).optional().default(''),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        physicalQuantity: z.number().min(0),
        reason: z.string().max(200).optional().default(''),
      })
    )
    .min(1),
  submitForApproval: z.boolean().optional().default(false),
});

router.get(
  '/',
  requirePermission('INVENTORY_VIEW', 'STOCK_COUNT_CREATE', 'REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const warehouseId = safeString(req.query.warehouseId);

    const filter: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ stockCounts: [] });
      filter.warehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    } else if (warehouseId && warehouseId !== 'ALL') {
      filter.warehouseId = parseObjectId(warehouseId, 'warehouseId');
    }

    const stockCounts = await StockCount.find(filter)
      .sort({ createdAt: -1 })
      .limit(150)
      .populate('warehouseId', 'name code')
      .populate('items.productId', 'name sku unit')
      .populate('countedBy', 'fullName')
      .populate('approvedBy', 'fullName')
      .lean();

    res.json({ stockCounts });
  })
);

router.post(
  '/',
  requirePermission('STOCK_COUNT_CREATE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(createCountSchema, req.body);
    const warehouseId = parseObjectId(data.warehouseId, 'warehouseId');
    assertWarehouseAccess(req.user!, warehouseId);

    const productIds = data.items.map((i) => parseObjectId(i.productId, 'productId'));
    const invDocs = await Inventory.find({
      warehouseId,
      productId: { $in: productIds },
    }).lean();
    const invMap = new Map(invDocs.map((d) => [String(d.productId), d.availableQty]));

    const items = data.items.map((item) => {
      const sysQty = invMap.get(item.productId) ?? 0;
      const diff = Number((item.physicalQuantity - sysQty).toFixed(4));
      return {
        productId: parseObjectId(item.productId, 'productId'),
        systemQuantity: sysQty,
        physicalQuantity: item.physicalQuantity,
        difference: diff,
        reason: item.reason || (diff === 0 ? 'Matched' : 'Physical count variance'),
      };
    });

    const countNumber = generateDocumentNumber('CNT');
    const stockCount = await StockCount.create({
      countNumber,
      warehouseId,
      countDate: data.countDate ? new Date(data.countDate) : new Date(),
      status: data.submitForApproval ? 'Pending Approval' : 'In Progress',
      items,
      countedBy: req.user!.id,
      notes: data.notes,
    });

    await recordAuditLog({
      actor: req.user!,
      action: 'CREATE_STOCK_COUNT',
      entityType: 'StockCount',
      entityId: String(stockCount._id),
      entityRef: countNumber,
      warehouseId,
      details: { itemCount: items.length, status: stockCount.status },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ stockCount });
  })
);

router.post(
  '/:id/submit',
  requirePermission('STOCK_COUNT_CREATE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'stockCountId');
    const sc = await StockCount.findById(id);
    if (!sc) return res.status(404).json({ error: 'Stock count not found' });
    if (sc.status !== 'In Progress') {
      return res.status(400).json({ error: 'Only In Progress counts can be submitted' });
    }
    assertWarehouseAccess(req.user!, sc.warehouseId);
    sc.status = 'Pending Approval';
    await sc.save();
    res.json({ stockCount: sc });
  })
);

router.post(
  '/:id/approve',
  requirePermission('STOCK_COUNT_APPROVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'stockCountId');

    const approved = await runInTransaction(async (session) => {
      const sc = await StockCount.findById(id).session(session);
      if (!sc) throw Object.assign(new Error('Stock count not found'), { statusCode: 404 });
      if (!['In Progress', 'Pending Approval'].includes(sc.status)) {
        throw Object.assign(new Error('Stock count has already been processed'), { statusCode: 400 });
      }
      assertWarehouseAccess(req.user!, sc.warehouseId);

      for (const item of sc.items) {
        if (item.difference === 0) continue;

        const product = await Product.findById(item.productId).session(session).lean();
        if (!product) continue;

        const adjNum = generateDocumentNumber('ADJ');
        const absDiff = Math.abs(item.difference);

        if (item.difference > 0) {
          const resInc = await applyStockIncrease({
            warehouseId: sc.warehouseId,
            productId: item.productId,
            quantity: absDiff,
            session,
          });
          const [adj] = await StockAdjustment.create(
            [
              {
                adjustmentNumber: adjNum,
                warehouseId: sc.warehouseId,
                productId: item.productId,
                adjustmentType: 'Physical Count Correction',
                previousQuantity: resInc.previousQty,
                adjustmentQuantity: item.difference,
                newQuantity: resInc.newQty,
                reason: item.reason || `Stock count ${sc.countNumber} surplus`,
                status: 'Approved',
                adjustedBy: sc.countedBy,
                approvedBy: req.user!.id,
                approvedAt: new Date(),
              },
            ],
            session ? { session } : undefined
          );
          await recordLedgerEntry({
            direction: 'IN',
            movementType: 'Adjustment In',
            warehouseId: sc.warehouseId,
            productId: item.productId,
            quantity: absDiff,
            unit: product.unit,
            unitCost: resInc.averageCost,
            previousQuantity: resInc.previousQty,
            quantityIn: absDiff,
            quantityOut: 0,
            newQuantity: resInc.newQty,
            referenceNumber: sc.countNumber,
            reason: item.reason || 'Physical Count Correction',
            performedBy: req.user!.id,
            relatedAdjustmentId: adj._id,
            session,
          });
        } else {
          const resDec = await applyStockDecrease({
            warehouseId: sc.warehouseId,
            productId: item.productId,
            quantity: absDiff,
            session,
          });
          const [adj] = await StockAdjustment.create(
            [
              {
                adjustmentNumber: adjNum,
                warehouseId: sc.warehouseId,
                productId: item.productId,
                adjustmentType: 'Physical Count Correction',
                previousQuantity: resDec.previousQty,
                adjustmentQuantity: item.difference,
                newQuantity: resDec.newQty,
                reason: item.reason || `Stock count ${sc.countNumber} shortage`,
                status: 'Approved',
                adjustedBy: sc.countedBy,
                approvedBy: req.user!.id,
                approvedAt: new Date(),
              },
            ],
            session ? { session } : undefined
          );
          await recordLedgerEntry({
            direction: 'OUT',
            movementType: 'Adjustment Out',
            warehouseId: sc.warehouseId,
            productId: item.productId,
            quantity: absDiff,
            unit: product.unit,
            unitCost: resDec.averageCost,
            previousQuantity: resDec.previousQty,
            quantityIn: 0,
            quantityOut: absDiff,
            newQuantity: resDec.newQty,
            referenceNumber: sc.countNumber,
            reason: item.reason || 'Physical Count Correction',
            performedBy: req.user!.id,
            relatedAdjustmentId: adj._id,
            session,
          });
        }
      }

      sc.status = 'Approved';
      sc.approvedBy = parseObjectId(req.user!.id, 'userId');
      sc.approvedAt = new Date();
      await sc.save(session ? { session } : undefined);

      await createNotification({
        type: 'STOCK_COUNT_APPROVED',
        title: `Stock Count Approved (${sc.countNumber})`,
        titleSo: `Tirakoobka Jirka waa la ansixiyay (${sc.countNumber})`,
        message: `Physical stock count ${sc.countNumber} has been approved and inventory reconciled.`,
        messageSo: `Tirakoobka jirka ${sc.countNumber} waa la ansixiyay, kaydkana waa la saxay.`,
        warehouseId: sc.warehouseId,
        referenceNumber: sc.countNumber,
        session,
      });

      await recordAuditLog({
        actor: req.user!,
        action: 'APPROVE_STOCK_COUNT',
        entityType: 'StockCount',
        entityId: String(sc._id),
        entityRef: sc.countNumber,
        warehouseId: sc.warehouseId,
        ipAddress: req.ip || '',
        session,
      });

      return sc;
    });

    res.json({ stockCount: approved });
  })
);

router.post(
  '/:id/reject',
  requirePermission('STOCK_COUNT_APPROVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'stockCountId');
    const sc = await StockCount.findById(id);
    if (!sc) return res.status(404).json({ error: 'Stock count not found' });
    if (!['In Progress', 'Pending Approval'].includes(sc.status)) {
      return res.status(400).json({ error: 'Cannot reject processed stock count' });
    }
    assertWarehouseAccess(req.user!, sc.warehouseId);
    sc.status = 'Rejected';
    sc.approvedBy = parseObjectId(req.user!.id, 'userId');
    sc.approvedAt = new Date();
    await sc.save();
    res.json({ stockCount: sc });
  })
);

export default router;

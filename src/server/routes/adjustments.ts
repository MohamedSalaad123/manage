import { Router } from 'express';
import { z } from 'zod';
import { StockAdjustment, Inventory, Product } from '../models';
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

const adjustmentSchema = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  adjustmentType: z.enum([
    'Increase Stock',
    'Decrease Stock',
    'Damaged Stock',
    'Lost Stock',
    'Physical Count Correction',
  ]),
  quantity: z.number().positive(),
  directionOverride: z.enum(['IN', 'OUT']).optional(),
  reason: z.string().min(3).max(250),
  notes: z.string().max(500).optional().default(''),
  approveNow: z.boolean().optional().default(true),
});

router.get(
  '/',
  requirePermission('INVENTORY_VIEW', 'ADJUSTMENT_CREATE', 'REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const warehouseId = safeString(req.query.warehouseId);

    const filter: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ adjustments: [] });
      filter.warehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    } else if (warehouseId && warehouseId !== 'ALL') {
      filter.warehouseId = parseObjectId(warehouseId, 'warehouseId');
    }

    const adjustments = await StockAdjustment.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('warehouseId', 'name code')
      .populate('productId', 'name sku unit')
      .populate('adjustedBy', 'fullName')
      .populate('approvedBy', 'fullName')
      .lean();

    res.json({ adjustments });
  })
);

router.post(
  '/',
  requirePermission('ADJUSTMENT_CREATE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(adjustmentSchema, req.body);
    const warehouseId = parseObjectId(data.warehouseId, 'warehouseId');
    const productId = parseObjectId(data.productId, 'productId');
    assertWarehouseAccess(req.user!, warehouseId);

    const canApprove =
      req.user!.role === 'SUPER_ADMIN' || req.user!.permissions.has('ADJUSTMENT_APPROVE');

    const [product, inv] = await Promise.all([
      Product.findById(productId).lean(),
      Inventory.findOne({ warehouseId, productId }).lean(),
    ]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const prevQty = inv?.availableQty ?? 0;
    const isIncrease =
      data.adjustmentType === 'Increase Stock' ||
      (data.adjustmentType === 'Physical Count Correction' && data.directionOverride === 'IN');
    const signedDelta = isIncrease ? data.quantity : -data.quantity;
    const newQty = Number((prevQty + signedDelta).toFixed(4));

    if (newQty < 0) {
      return res.status(400).json({
        error: `Adjustment would result in negative inventory (${newQty}). Available: ${prevQty}`,
      });
    }

    const adjNumber = generateDocumentNumber('ADJ');
    const shouldApprove = Boolean(data.approveNow && canApprove);

    const created = await runInTransaction(async (session) => {
      const [adj] = await StockAdjustment.create(
        [
          {
            adjustmentNumber: adjNumber,
            warehouseId,
            productId,
            adjustmentType: data.adjustmentType,
            previousQuantity: prevQty,
            adjustmentQuantity: signedDelta,
            newQuantity: newQty,
            reason: data.reason,
            notes: data.notes,
            status: shouldApprove ? 'Approved' : 'Pending',
            adjustedBy: req.user!.id,
            approvedBy: shouldApprove ? req.user!.id : null,
            approvedAt: shouldApprove ? new Date() : null,
          },
        ],
        session ? { session } : undefined
      );

      if (shouldApprove) {
        if (isIncrease) {
          const resInc = await applyStockIncrease({
            warehouseId,
            productId,
            quantity: data.quantity,
            session,
          });
          await recordLedgerEntry({
            direction: 'IN',
            movementType: 'Adjustment In',
            warehouseId,
            productId,
            quantity: data.quantity,
            unit: product.unit,
            unitCost: resInc.averageCost,
            previousQuantity: resInc.previousQty,
            quantityIn: data.quantity,
            quantityOut: 0,
            newQuantity: resInc.newQty,
            referenceNumber: adjNumber,
            reason: data.reason,
            notes: data.notes,
            performedBy: req.user!.id,
            relatedAdjustmentId: adj._id,
            session,
          });
        } else {
          const resDec = await applyStockDecrease({
            warehouseId,
            productId,
            quantity: data.quantity,
            session,
          });
          await recordLedgerEntry({
            direction: 'OUT',
            movementType: data.adjustmentType === 'Damaged Stock' ? 'Damaged Stock' : 'Adjustment Out',
            warehouseId,
            productId,
            quantity: data.quantity,
            unit: product.unit,
            unitCost: resDec.averageCost,
            previousQuantity: resDec.previousQty,
            quantityIn: 0,
            quantityOut: data.quantity,
            newQuantity: resDec.newQty,
            referenceNumber: adjNumber,
            reason: data.reason,
            notes: data.notes,
            performedBy: req.user!.id,
            relatedAdjustmentId: adj._id,
            session,
          });
        }

        await createNotification({
          type: 'STOCK_ADJUSTMENT',
          title: `Stock Adjustment Applied (${adjNumber})`,
          titleSo: `Sixitaan Kayd ah waa la fuliyay (${adjNumber})`,
          message: `${data.adjustmentType} of ${data.quantity} ${product.unit} for ${product.name}.`,
          messageSo: `${data.adjustmentType}: ${data.quantity} ${product.unit} oo ${product.name} ah.`,
          warehouseId,
          productId,
          referenceNumber: adjNumber,
          session,
        });
      }

      await recordAuditLog({
        actor: req.user!,
        action: shouldApprove ? 'APPLY_STOCK_ADJUSTMENT' : 'CREATE_STOCK_ADJUSTMENT',
        entityType: 'Adjustment',
        entityId: String(adj._id),
        entityRef: adjNumber,
        warehouseId,
        details: {
          adjustmentType: data.adjustmentType,
          previousQuantity: prevQty,
          adjustmentQuantity: signedDelta,
          newQuantity: newQty,
          reason: data.reason,
        },
        ipAddress: req.ip || '',
        session,
      });

      return adj;
    });

    res.status(201).json({ adjustment: created });
  })
);

router.post(
  '/:id/approve',
  requirePermission('ADJUSTMENT_APPROVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'adjustmentId');

    const approved = await runInTransaction(async (session) => {
      const adj = await StockAdjustment.findById(id).session(session);
      if (!adj) throw Object.assign(new Error('Adjustment not found'), { statusCode: 404 });
      if (adj.status !== 'Pending') {
        throw Object.assign(new Error('Only Pending adjustments can be approved'), { statusCode: 400 });
      }
      assertWarehouseAccess(req.user!, adj.warehouseId);

      const product = await Product.findById(adj.productId).session(session).lean();
      if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

      const qty = Math.abs(adj.adjustmentQuantity);
      if (adj.adjustmentQuantity > 0) {
        const resInc = await applyStockIncrease({
          warehouseId: adj.warehouseId,
          productId: adj.productId,
          quantity: qty,
          session,
        });
        await recordLedgerEntry({
          direction: 'IN',
          movementType: 'Adjustment In',
          warehouseId: adj.warehouseId,
          productId: adj.productId,
          quantity: qty,
          unit: product.unit,
          unitCost: resInc.averageCost,
          previousQuantity: resInc.previousQty,
          quantityIn: qty,
          quantityOut: 0,
          newQuantity: resInc.newQty,
          referenceNumber: adj.adjustmentNumber,
          reason: adj.reason,
          notes: adj.notes,
          performedBy: req.user!.id,
          relatedAdjustmentId: adj._id,
          session,
        });
      } else {
        const resDec = await applyStockDecrease({
          warehouseId: adj.warehouseId,
          productId: adj.productId,
          quantity: qty,
          session,
        });
        await recordLedgerEntry({
          direction: 'OUT',
          movementType: adj.adjustmentType === 'Damaged Stock' ? 'Damaged Stock' : 'Adjustment Out',
          warehouseId: adj.warehouseId,
          productId: adj.productId,
          quantity: qty,
          unit: product.unit,
          unitCost: resDec.averageCost,
          previousQuantity: resDec.previousQty,
          quantityIn: 0,
          quantityOut: qty,
          newQuantity: resDec.newQty,
          referenceNumber: adj.adjustmentNumber,
          reason: adj.reason,
          notes: adj.notes,
          performedBy: req.user!.id,
          relatedAdjustmentId: adj._id,
          session,
        });
      }

      adj.status = 'Approved';
      adj.approvedBy = parseObjectId(req.user!.id, 'userId');
      adj.approvedAt = new Date();
      await adj.save(session ? { session } : undefined);

      await recordAuditLog({
        actor: req.user!,
        action: 'APPROVE_STOCK_ADJUSTMENT',
        entityType: 'Adjustment',
        entityId: String(adj._id),
        entityRef: adj.adjustmentNumber,
        warehouseId: adj.warehouseId,
        ipAddress: req.ip || '',
        session,
      });

      return adj;
    });

    res.json({ adjustment: approved });
  })
);

export default router;

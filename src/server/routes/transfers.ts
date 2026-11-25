import { Router } from 'express';
import { z } from 'zod';
import { StockTransfer, Product, Warehouse, Inventory } from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
  assertWarehouseAccess,
} from '../middleware/auth';
import { runInTransaction } from '../config/db';
import {
  applyStockIncrease,
  dispatchReservedStock,
  recordLedgerEntry,
  releaseReservedStock,
  reserveStockForTransfer,
} from '../services/inventoryService';
import { createNotification, recordAuditLog } from '../services/auditService';
import { generateDocumentNumber } from '../services/sequenceService';
import { asyncHandler, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const createTransferSchema = z.object({
  sourceWarehouseId: z.string().min(1),
  destinationWarehouseId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  transferDate: z.string().optional(),
  notes: z.string().max(500).optional().default(''),
  saveAsDraft: z.boolean().optional().default(false),
});

const receiveTransferSchema = z.object({
  receivedQty: z.number().min(0),
  damagedQty: z.number().min(0).optional().default(0),
  missingQty: z.number().min(0).optional().default(0),
  notes: z.string().max(500).optional().default(''),
});

router.get(
  '/',
  requirePermission('INVENTORY_VIEW', 'TRANSFER_CREATE', 'REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const status = safeString(req.query.status);
    const warehouseId = safeString(req.query.warehouseId);

    const filter: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ transfers: [] });
      const wid = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
      filter.$or = [{ sourceWarehouseId: wid }, { destinationWarehouseId: wid }];
    } else if (warehouseId && warehouseId !== 'ALL') {
      const wid = parseObjectId(warehouseId, 'warehouseId');
      filter.$or = [{ sourceWarehouseId: wid }, { destinationWarehouseId: wid }];
    }

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const transfers = await StockTransfer.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('sourceWarehouseId', 'name code location')
      .populate('destinationWarehouseId', 'name code location')
      .populate('productId', 'name sku unit')
      .populate('requestedBy', 'fullName')
      .populate('approvedBy', 'fullName')
      .populate('dispatchedBy', 'fullName')
      .populate('receivedBy', 'fullName')
      .lean();

    res.json({ transfers });
  })
);

router.post(
  '/',
  requirePermission('TRANSFER_CREATE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(createTransferSchema, req.body);
    const sourceId = parseObjectId(data.sourceWarehouseId, 'sourceWarehouseId');
    const destId = parseObjectId(data.destinationWarehouseId, 'destinationWarehouseId');
    const productId = parseObjectId(data.productId, 'productId');

    if (String(sourceId) === String(destId)) {
      return res.status(400).json({ error: 'Source and destination warehouses cannot be the same' });
    }

    assertWarehouseAccess(req.user!, sourceId);

    const [sourceWh, destWh, product, sourceInv] = await Promise.all([
      Warehouse.findById(sourceId).lean(),
      Warehouse.findById(destId).lean(),
      Product.findById(productId).lean(),
      Inventory.findOne({ warehouseId: sourceId, productId }).lean(),
    ]);

    if (!sourceWh || !destWh) return res.status(404).json({ error: 'Warehouse not found' });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const available = sourceInv?.availableQty ?? 0;
    if (available < data.quantity) {
      return res.status(400).json({
        error: `Insufficient stock in ${sourceWh.name}. Available: ${available} ${product.unit}`,
      });
    }

    const transferNumber = generateDocumentNumber('TRF');
    const transfer = await StockTransfer.create({
      transferNumber,
      sourceWarehouseId: sourceId,
      destinationWarehouseId: destId,
      productId,
      quantity: data.quantity,
      transferDate: data.transferDate ? new Date(data.transferDate) : new Date(),
      status: data.saveAsDraft ? 'Draft' : 'Pending Approval',
      requestedBy: req.user!.id,
      notes: data.notes,
    });

    if (!data.saveAsDraft) {
      await createNotification({
        type: 'TRANSFER_REQUEST',
        title: `Transfer Request (${transferNumber})`,
        titleSo: `Codsi Wareejin Bakhaar (${transferNumber})`,
        message: `Requested transfer of ${data.quantity} ${product.unit} of ${product.name} from ${sourceWh.name} to ${destWh.name}.`,
        messageSo: `Waxaa la codsaday wareejinta ${data.quantity} ${product.unit} oo ${product.name} ah kana socda ${sourceWh.name} kuna socda ${destWh.name}.`,
        warehouseId: sourceId,
        productId,
        referenceNumber: transferNumber,
      });
    }

    await recordAuditLog({
      actor: req.user!,
      action: 'CREATE_TRANSFER',
      entityType: 'Transfer',
      entityId: String(transfer._id),
      entityRef: transferNumber,
      warehouseId: sourceId,
      details: { destinationWarehouseId: String(destId), productId: String(productId), quantity: data.quantity },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ transfer });
  })
);

router.post(
  '/:id/submit',
  requirePermission('TRANSFER_CREATE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transferId');
    const transfer = await StockTransfer.findById(id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.status !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft transfers can be submitted' });
    }
    assertWarehouseAccess(req.user!, transfer.sourceWarehouseId);
    transfer.status = 'Pending Approval';
    await transfer.save();
    res.json({ transfer });
  })
);

router.post(
  '/:id/approve',
  requirePermission('TRANSFER_APPROVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transferId');

    const updated = await runInTransaction(async (session) => {
      const trf = await StockTransfer.findById(id).session(session);
      if (!trf) throw Object.assign(new Error('Transfer not found'), { statusCode: 404 });
      if (trf.status !== 'Pending Approval') {
        throw Object.assign(new Error('Only Pending Approval transfers can be approved'), {
          statusCode: 400,
        });
      }
      assertWarehouseAccess(req.user!, trf.sourceWarehouseId);

      // Reserve stock at source so it cannot be double-allocated before dispatch
      await reserveStockForTransfer({
        warehouseId: trf.sourceWarehouseId,
        productId: trf.productId,
        quantity: trf.quantity,
        session,
      });

      trf.status = 'Approved';
      trf.approvedBy = parseObjectId(req.user!.id, 'userId');
      trf.approvedAt = new Date();
      await trf.save(session ? { session } : undefined);

      await createNotification({
        type: 'TRANSFER_APPROVED',
        title: `Transfer Approved (${trf.transferNumber})`,
        titleSo: `Wareejin waa la ansixiyay (${trf.transferNumber})`,
        message: `Transfer ${trf.transferNumber} has been approved and stock is reserved for dispatch.`,
        messageSo: `Wareejinta ${trf.transferNumber} waa la ansixiyay, alaabtana waa la diyaariyay dirista.`,
        warehouseId: trf.sourceWarehouseId,
        productId: trf.productId,
        referenceNumber: trf.transferNumber,
        session,
      });

      await recordAuditLog({
        actor: req.user!,
        action: 'APPROVE_TRANSFER',
        entityType: 'Transfer',
        entityId: String(trf._id),
        entityRef: trf.transferNumber,
        warehouseId: trf.sourceWarehouseId,
        ipAddress: req.ip || '',
        session,
      });

      return trf;
    });

    res.json({ transfer: updated });
  })
);

router.post(
  '/:id/reject',
  requirePermission('TRANSFER_APPROVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transferId');
    const body = validateBody(z.object({ reason: z.string().min(2).max(300) }), req.body);

    const trf = await StockTransfer.findById(id);
    if (!trf) return res.status(404).json({ error: 'Transfer not found' });
    if (trf.status !== 'Pending Approval') {
      return res.status(400).json({ error: 'Only Pending Approval transfers can be rejected' });
    }
    assertWarehouseAccess(req.user!, trf.sourceWarehouseId);

    trf.status = 'Rejected';
    trf.rejectionReason = body.reason;
    trf.approvedBy = parseObjectId(req.user!.id, 'userId');
    trf.approvedAt = new Date();
    await trf.save();

    await createNotification({
      type: 'TRANSFER_REJECTED',
      title: `Transfer Rejected (${trf.transferNumber})`,
      titleSo: `Wareejin waa la diiday (${trf.transferNumber})`,
      message: `Transfer ${trf.transferNumber} was rejected: ${body.reason}`,
      messageSo: `Wareejinta ${trf.transferNumber} waa la diiday: ${body.reason}`,
      warehouseId: trf.sourceWarehouseId,
      productId: trf.productId,
      referenceNumber: trf.transferNumber,
    });

    await recordAuditLog({
      actor: req.user!,
      action: 'REJECT_TRANSFER',
      entityType: 'Transfer',
      entityId: String(trf._id),
      entityRef: trf.transferNumber,
      warehouseId: trf.sourceWarehouseId,
      details: { reason: body.reason },
      ipAddress: req.ip || '',
    });

    res.json({ transfer: trf });
  })
);

router.post(
  '/:id/dispatch',
  requirePermission('TRANSFER_DISPATCH'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transferId');

    const dispatched = await runInTransaction(async (session) => {
      const trf = await StockTransfer.findById(id).session(session);
      if (!trf) throw Object.assign(new Error('Transfer not found'), { statusCode: 404 });
      if (trf.status !== 'Approved') {
        throw Object.assign(new Error('Transfer must be Approved before dispatch'), {
          statusCode: 400,
        });
      }
      assertWarehouseAccess(req.user!, trf.sourceWarehouseId);

      const product = await Product.findById(trf.productId).session(session).lean();
      if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

      const dispatchRes = await dispatchReservedStock({
        warehouseId: trf.sourceWarehouseId,
        productId: trf.productId,
        quantity: trf.quantity,
        session,
      });

      trf.status = 'In Transit';
      trf.dispatchedQuantity = trf.quantity;
      trf.unitCostAtDispatch = dispatchRes.averageCost;
      trf.dispatchedBy = parseObjectId(req.user!.id, 'userId');
      trf.dispatchedAt = new Date();
      await trf.save(session ? { session } : undefined);

      await recordLedgerEntry({
        direction: 'OUT',
        movementType: 'Transfer Out',
        warehouseId: trf.sourceWarehouseId,
        productId: trf.productId,
        quantity: trf.quantity,
        unit: product.unit,
        unitCost: dispatchRes.averageCost,
        previousQuantity: dispatchRes.previousQty,
        quantityIn: 0,
        quantityOut: trf.quantity,
        newQuantity: dispatchRes.newQty,
        referenceNumber: trf.transferNumber,
        notes: `Dispatched to destination warehouse`,
        performedBy: req.user!.id,
        relatedTransferId: trf._id,
        session,
      });

      await recordAuditLog({
        actor: req.user!,
        action: 'DISPATCH_TRANSFER',
        entityType: 'Transfer',
        entityId: String(trf._id),
        entityRef: trf.transferNumber,
        warehouseId: trf.sourceWarehouseId,
        details: { quantity: trf.quantity, unitCost: dispatchRes.averageCost },
        ipAddress: req.ip || '',
        session,
      });

      return trf;
    });

    res.json({ transfer: dispatched });
  })
);

router.post(
  '/:id/receive',
  requirePermission('TRANSFER_RECEIVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transferId');
    const body = validateBody(receiveTransferSchema, req.body);

    const updated = await runInTransaction(async (session) => {
      const trf = await StockTransfer.findById(id).session(session);
      if (!trf) throw Object.assign(new Error('Transfer not found'), { statusCode: 404 });
      if (!['In Transit', 'Partially Received'].includes(trf.status)) {
        throw Object.assign(new Error('Transfer is not currently in transit'), { statusCode: 400 });
      }
      assertWarehouseAccess(req.user!, trf.destinationWarehouseId);

      const batchTotal = body.receivedQty + body.damagedQty + body.missingQty;
      if (batchTotal <= 0) {
        throw Object.assign(new Error('Receipt quantities must be greater than zero'), {
          statusCode: 400,
        });
      }

      const alreadyAccounted = trf.receivedQuantity + trf.damagedQuantity + trf.missingQuantity;
      const remaining = Number((trf.dispatchedQuantity - alreadyAccounted).toFixed(4));
      if (batchTotal > remaining + 0.0001) {
        throw Object.assign(
          new Error(`Received + damaged + missing (${batchTotal}) exceeds remaining in-transit quantity (${remaining})`),
          { statusCode: 400 }
        );
      }

      const product = await Product.findById(trf.productId).session(session).lean();
      if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

      if (body.receivedQty > 0) {
        const incRes = await applyStockIncrease({
          warehouseId: trf.destinationWarehouseId,
          productId: trf.productId,
          quantity: body.receivedQty,
          unitCost: trf.unitCostAtDispatch,
          session,
        });

        await recordLedgerEntry({
          direction: 'IN',
          movementType: 'Transfer In',
          warehouseId: trf.destinationWarehouseId,
          productId: trf.productId,
          quantity: body.receivedQty,
          unit: product.unit,
          unitCost: trf.unitCostAtDispatch,
          previousQuantity: incRes.previousQty,
          quantityIn: body.receivedQty,
          quantityOut: 0,
          newQuantity: incRes.newQty,
          referenceNumber: trf.transferNumber,
          notes: body.notes || 'Transfer receipt confirmed',
          performedBy: req.user!.id,
          relatedTransferId: trf._id,
          session,
        });
      }

      if (body.damagedQty > 0) {
        await recordLedgerEntry({
          direction: 'LEDGER',
          movementType: 'Damaged Stock',
          warehouseId: trf.destinationWarehouseId,
          productId: trf.productId,
          quantity: body.damagedQty,
          unit: product.unit,
          unitCost: trf.unitCostAtDispatch,
          previousQuantity: 0,
          quantityIn: 0,
          quantityOut: body.damagedQty,
          newQuantity: 0,
          referenceNumber: trf.transferNumber,
          reason: 'Damaged in transit',
          notes: body.notes,
          performedBy: req.user!.id,
          relatedTransferId: trf._id,
          session,
        });
      }

      trf.receivedQuantity = Number((trf.receivedQuantity + body.receivedQty).toFixed(4));
      trf.damagedQuantity = Number((trf.damagedQuantity + body.damagedQty).toFixed(4));
      trf.missingQuantity = Number((trf.missingQuantity + body.missingQty).toFixed(4));
      trf.receivedBy = parseObjectId(req.user!.id, 'userId');
      trf.receiptLogs.push({
        receivedQty: body.receivedQty,
        damagedQty: body.damagedQty,
        missingQty: body.missingQty,
        notes: body.notes,
        receivedBy: parseObjectId(req.user!.id, 'userId'),
        receivedAt: new Date(),
      });

      const totalAccountedNow = trf.receivedQuantity + trf.damagedQuantity + trf.missingQuantity;
      if (totalAccountedNow >= trf.dispatchedQuantity - 0.0001) {
        trf.status = 'Completed';
        trf.completedAt = new Date();
      } else {
        trf.status = 'Partially Received';
      }

      await trf.save(session ? { session } : undefined);

      await createNotification({
        type: 'TRANSFER_RECEIVED',
        title: `Transfer ${trf.status} (${trf.transferNumber})`,
        titleSo: `Wareejin la helay: ${trf.status} (${trf.transferNumber})`,
        message: `Received ${body.receivedQty} ${product.unit} (Damaged: ${body.damagedQty}, Missing: ${body.missingQty}) for ${trf.transferNumber}.`,
        messageSo: `Waxaa la helay ${body.receivedQty} ${product.unit} (Waxyeello: ${body.damagedQty}, Maqan: ${body.missingQty}) ee ${trf.transferNumber}.`,
        warehouseId: trf.destinationWarehouseId,
        productId: trf.productId,
        referenceNumber: trf.transferNumber,
        session,
      });

      await recordAuditLog({
        actor: req.user!,
        action: 'RECEIVE_TRANSFER',
        entityType: 'Transfer',
        entityId: String(trf._id),
        entityRef: trf.transferNumber,
        warehouseId: trf.destinationWarehouseId,
        details: {
          receivedQty: body.receivedQty,
          damagedQty: body.damagedQty,
          missingQty: body.missingQty,
          status: trf.status,
        },
        ipAddress: req.ip || '',
        session,
      });

      return trf;
    });

    res.json({ transfer: updated });
  })
);

router.post(
  '/:id/cancel',
  requirePermission('TRANSFER_CREATE', 'TRANSFER_APPROVE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transferId');

    const cancelled = await runInTransaction(async (session) => {
      const trf = await StockTransfer.findById(id).session(session);
      if (!trf) throw Object.assign(new Error('Transfer not found'), { statusCode: 404 });
      if (!['Draft', 'Pending Approval', 'Approved'].includes(trf.status)) {
        throw Object.assign(new Error('Cannot cancel a transfer that is already dispatched or completed'), {
          statusCode: 400,
        });
      }
      assertWarehouseAccess(req.user!, trf.sourceWarehouseId);

      if (trf.status === 'Approved') {
        await releaseReservedStock({
          warehouseId: trf.sourceWarehouseId,
          productId: trf.productId,
          quantity: trf.quantity,
          session,
        });
      }

      trf.status = 'Cancelled';
      await trf.save(session ? { session } : undefined);

      await recordAuditLog({
        actor: req.user!,
        action: 'CANCEL_TRANSFER',
        entityType: 'Transfer',
        entityId: String(trf._id),
        entityRef: trf.transferNumber,
        warehouseId: trf.sourceWarehouseId,
        ipAddress: req.ip || '',
        session,
      });

      return trf;
    });

    res.json({ transfer: cancelled });
  })
);

export default router;

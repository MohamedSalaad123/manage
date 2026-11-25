import { Router } from 'express';
import { z } from 'zod';
import { StockTransaction, Product, Warehouse, Inventory } from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
  assertWarehouseAccess,
} from '../middleware/auth';
import { runInTransaction } from '../config/db';
import { applyStockDecrease } from '../services/inventoryService';
import { createNotification, recordAuditLog } from '../services/auditService';
import { generateDocumentNumber } from '../services/sequenceService';
import { asyncHandler, escapeRegex, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const stockOutSchema = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  destinationCustomer: z.string().min(2).max(160),
  referenceNumber: z.string().max(80).optional().default(''),
  reason: z.string().min(2).max(200),
  transactionDate: z.string().optional(),
  notes: z.string().max(500).optional().default(''),
  confirmNow: z.boolean().optional().default(true),
});

router.get(
  '/',
  requirePermission('INVENTORY_VIEW', 'STOCK_OUT_CREATE', 'REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const warehouseId = safeString(req.query.warehouseId);
    const status = safeString(req.query.status);
    const search = safeString(req.query.search);

    const filter: Record<string, unknown> = {
      direction: 'OUT',
      movementType: 'Stock Out',
    };

    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ transactions: [] });
      filter.warehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    } else if (warehouseId && warehouseId !== 'ALL') {
      filter.warehouseId = parseObjectId(warehouseId, 'warehouseId');
    }

    if (status && ['Draft', 'Confirmed', 'Cancelled'].includes(status)) {
      filter.status = status;
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { transactionNumber: rx },
        { destinationCustomer: rx },
        { referenceNumber: rx },
      ];
    }

    const transactions = await StockTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('warehouseId', 'name code')
      .populate('productId', 'name sku unit')
      .populate('performedBy', 'fullName')
      .populate('confirmedBy', 'fullName')
      .lean();

    res.json({ transactions });
  })
);

router.post(
  '/',
  requirePermission('STOCK_OUT_CREATE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(stockOutSchema, req.body);
    const warehouseId = parseObjectId(data.warehouseId, 'warehouseId');
    const productId = parseObjectId(data.productId, 'productId');
    assertWarehouseAccess(req.user!, warehouseId);

    if (data.confirmNow && !req.user!.permissions.has('STOCK_OUT_CONFIRM') && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Not authorized to confirm Stock Out' });
    }

    const [product, warehouse, currentInv] = await Promise.all([
      Product.findById(productId).lean(),
      Warehouse.findById(warehouseId).lean(),
      Inventory.findOne({ warehouseId, productId }).lean(),
    ]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    const avail = currentInv?.availableQty ?? 0;
    if (avail < data.quantity) {
      return res.status(400).json({
        error: `Negative inventory prevented. Available in ${warehouse.name}: ${avail} ${product.unit}`,
      });
    }

    const txNumber = generateDocumentNumber('SOUT');
    const txDate = data.transactionDate ? new Date(data.transactionDate) : new Date();

    const created = await runInTransaction(async (session) => {
      if (data.confirmNow) {
        const invRes = await applyStockDecrease({
          warehouseId,
          productId,
          quantity: data.quantity,
          session,
        });

        const [tx] = await StockTransaction.create(
          [
            {
              transactionNumber: txNumber,
              direction: 'OUT',
              movementType: 'Stock Out',
              status: 'Confirmed',
              ledgerPosted: true,
              warehouseId,
              productId,
              quantity: data.quantity,
              unit: product.unit,
              unitCost: invRes.averageCost,
              totalAmount: Number((data.quantity * invRes.averageCost).toFixed(2)),
              previousQuantity: invRes.previousQty,
              quantityIn: 0,
              quantityOut: data.quantity,
              newQuantity: invRes.newQty,
              destinationCustomer: data.destinationCustomer,
              referenceNumber: data.referenceNumber || txNumber,
              reason: data.reason,
              notes: data.notes,
              transactionDate: txDate,
              performedBy: req.user!.id,
              confirmedBy: req.user!.id,
              confirmedAt: new Date(),
            },
          ],
          session ? { session } : undefined
        );

        await createNotification({
          type: 'STOCK_OUT',
          title: `Stock Out Confirmed (${txNumber})`,
          titleSo: `Alaab Baxday waa la xaqiijiyay (${txNumber})`,
          message: `Issued ${data.quantity} ${product.unit} of ${product.name} from ${warehouse.name} to ${data.destinationCustomer}.`,
          messageSo: `Waxaa laga saaray ${data.quantity} ${product.unit} oo ah ${product.name} bakhaarka ${warehouse.name} loona diray ${data.destinationCustomer}.`,
          warehouseId,
          productId,
          referenceNumber: txNumber,
          session,
        });

        await recordAuditLog({
          actor: req.user!,
          action: 'CONFIRM_STOCK_OUT',
          entityType: 'StockOut',
          entityId: String(tx._id),
          entityRef: txNumber,
          warehouseId,
          details: { productId: String(productId), quantity: data.quantity, destination: data.destinationCustomer },
          ipAddress: req.ip || '',
          session,
        });

        return tx;
      }

      const [draft] = await StockTransaction.create(
        [
          {
            transactionNumber: txNumber,
            direction: 'OUT',
            movementType: 'Stock Out',
            status: 'Draft',
            ledgerPosted: false,
            warehouseId,
            productId,
            quantity: data.quantity,
            unit: product.unit,
            unitCost: currentInv?.averageCost || product.purchasePrice,
            totalAmount: Number((data.quantity * (currentInv?.averageCost || product.purchasePrice)).toFixed(2)),
            previousQuantity: 0,
            quantityIn: 0,
            quantityOut: 0,
            newQuantity: 0,
            destinationCustomer: data.destinationCustomer,
            referenceNumber: data.referenceNumber || txNumber,
            reason: data.reason,
            notes: data.notes,
            transactionDate: txDate,
            performedBy: req.user!.id,
          },
        ],
        session ? { session } : undefined
      );
      return draft;
    });

    res.status(201).json({ transaction: created });
  })
);

router.post(
  '/:id/confirm',
  requirePermission('STOCK_OUT_CONFIRM'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transactionId');

    const confirmed = await runInTransaction(async (session) => {
      const tx = await StockTransaction.findById(id).session(session);
      if (!tx) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
      if (tx.direction !== 'OUT' || tx.status !== 'Draft') {
        throw Object.assign(new Error('Only Draft Stock Out transactions can be confirmed'), {
          statusCode: 400,
        });
      }
      assertWarehouseAccess(req.user!, tx.warehouseId);

      const invRes = await applyStockDecrease({
        warehouseId: tx.warehouseId,
        productId: tx.productId,
        quantity: tx.quantity,
        session,
      });

      tx.status = 'Confirmed';
      tx.ledgerPosted = true;
      tx.unitCost = invRes.averageCost;
      tx.totalAmount = Number((tx.quantity * invRes.averageCost).toFixed(2));
      tx.previousQuantity = invRes.previousQty;
      tx.quantityIn = 0;
      tx.quantityOut = tx.quantity;
      tx.newQuantity = invRes.newQty;
      tx.confirmedBy = parseObjectId(req.user!.id, 'userId');
      tx.confirmedAt = new Date();
      await tx.save(session ? { session } : undefined);

      await recordAuditLog({
        actor: req.user!,
        action: 'CONFIRM_STOCK_OUT',
        entityType: 'StockOut',
        entityId: String(tx._id),
        entityRef: tx.transactionNumber,
        warehouseId: tx.warehouseId,
        details: { productId: String(tx.productId), quantity: tx.quantity },
        ipAddress: req.ip || '',
        session,
      });

      return tx;
    });

    res.json({ transaction: confirmed });
  })
);

export default router;

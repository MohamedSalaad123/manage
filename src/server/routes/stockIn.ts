import { Router } from 'express';
import { z } from 'zod';
import { StockTransaction, Product, Warehouse } from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
  assertWarehouseAccess,
} from '../middleware/auth';
import { runInTransaction } from '../config/db';
import { applyStockIncrease } from '../services/inventoryService';
import { createNotification, recordAuditLog } from '../services/auditService';
import { generateDocumentNumber } from '../services/sequenceService';
import { asyncHandler, escapeRegex, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const stockInSchema = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40).optional(),
  purchasePrice: z.number().min(0),
  supplierId: z.string().nullable().optional(),
  invoiceNumber: z.string().max(80).optional().default(''),
  transactionDate: z.string().optional(),
  notes: z.string().max(500).optional().default(''),
  attachmentUrl: z.string().max(500).optional().default(''),
  confirmNow: z.boolean().optional().default(false),
});

router.get(
  '/',
  requirePermission('INVENTORY_VIEW', 'STOCK_IN_CREATE', 'REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const warehouseId = safeString(req.query.warehouseId);
    const status = safeString(req.query.status);
    const search = safeString(req.query.search);

    const filter: Record<string, unknown> = {
      direction: 'IN',
      movementType: { $in: ['Stock In', 'Opening Balance'] },
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
      filter.$or = [{ transactionNumber: rx }, { invoiceNumber: rx }, { notes: rx }];
    }

    const transactions = await StockTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('warehouseId', 'name code')
      .populate('productId', 'name sku unit')
      .populate('supplierId', 'supplierName companyName')
      .populate('performedBy', 'fullName')
      .populate('confirmedBy', 'fullName')
      .lean();

    res.json({ transactions });
  })
);

router.post(
  '/',
  requirePermission('STOCK_IN_CREATE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(stockInSchema, req.body);
    const warehouseId = parseObjectId(data.warehouseId, 'warehouseId');
    const productId = parseObjectId(data.productId, 'productId');
    assertWarehouseAccess(req.user!, warehouseId);

    if (data.confirmNow && !req.user!.permissions.has('STOCK_IN_CONFIRM') && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Not authorized to confirm Stock In immediately' });
    }

    const [product, warehouse] = await Promise.all([
      Product.findById(productId).lean(),
      Warehouse.findById(warehouseId).lean(),
    ]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    const txDate = data.transactionDate ? new Date(data.transactionDate) : new Date();
    const unit = data.unit || product.unit;
    const totalAmount = Number((data.quantity * data.purchasePrice).toFixed(2));
    const txNumber = generateDocumentNumber('SIN');

    const created = await runInTransaction(async (session) => {
      if (data.confirmNow) {
        const invResult = await applyStockIncrease({
          warehouseId,
          productId,
          quantity: data.quantity,
          unitCost: data.purchasePrice,
          session,
        });

        const [tx] = await StockTransaction.create(
          [
            {
              transactionNumber: txNumber,
              direction: 'IN',
              movementType: 'Stock In',
              status: 'Confirmed',
              ledgerPosted: true,
              warehouseId,
              productId,
              quantity: data.quantity,
              unit,
              unitCost: data.purchasePrice,
              totalAmount,
              previousQuantity: invResult.previousQty,
              quantityIn: data.quantity,
              quantityOut: 0,
              newQuantity: invResult.newQty,
              supplierId: data.supplierId ? parseObjectId(data.supplierId, 'supplierId') : null,
              invoiceNumber: data.invoiceNumber,
              referenceNumber: data.invoiceNumber || txNumber,
              notes: data.notes,
              attachmentUrl: data.attachmentUrl,
              transactionDate: txDate,
              performedBy: req.user!.id,
              confirmedBy: req.user!.id,
              confirmedAt: new Date(),
            },
          ],
          session ? { session } : undefined
        );

        await createNotification({
          type: 'STOCK_IN',
          title: `Stock In Confirmed (${txNumber})`,
          titleSo: `Alaab Soo Gashay waa la xaqiijiyay (${txNumber})`,
          message: `Received ${data.quantity} ${unit} of ${product.name} into ${warehouse.name}.`,
          messageSo: `Waxaa la helay ${data.quantity} ${unit} oo ah ${product.name} laguna daray ${warehouse.name}.`,
          warehouseId,
          productId,
          referenceNumber: txNumber,
          session,
        });

        await recordAuditLog({
          actor: req.user!,
          action: 'CONFIRM_STOCK_IN',
          entityType: 'StockIn',
          entityId: String(tx._id),
          entityRef: txNumber,
          warehouseId,
          details: { productId: String(productId), quantity: data.quantity, unitCost: data.purchasePrice },
          ipAddress: req.ip || '',
          session,
        });

        return tx;
      }

      const [draft] = await StockTransaction.create(
        [
          {
            transactionNumber: txNumber,
            direction: 'IN',
            movementType: 'Stock In',
            status: 'Draft',
            ledgerPosted: false,
            warehouseId,
            productId,
            quantity: data.quantity,
            unit,
            unitCost: data.purchasePrice,
            totalAmount,
            previousQuantity: 0,
            quantityIn: 0,
            quantityOut: 0,
            newQuantity: 0,
            supplierId: data.supplierId ? parseObjectId(data.supplierId, 'supplierId') : null,
            invoiceNumber: data.invoiceNumber,
            referenceNumber: data.invoiceNumber || txNumber,
            notes: data.notes,
            attachmentUrl: data.attachmentUrl,
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

router.put(
  '/:id',
  requirePermission('STOCK_IN_CREATE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transactionId');
    const existing = await StockTransaction.findById(id);
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });
    if (existing.status !== 'Draft') {
      return res.status(400).json({ error: 'Only unconfirmed Draft transactions can be edited' });
    }
    assertWarehouseAccess(req.user!, existing.warehouseId);

    const data = validateBody(stockInSchema, req.body);
    const warehouseId = parseObjectId(data.warehouseId, 'warehouseId');
    const productId = parseObjectId(data.productId, 'productId');
    assertWarehouseAccess(req.user!, warehouseId);

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    existing.warehouseId = warehouseId;
    existing.productId = productId;
    existing.quantity = data.quantity;
    existing.unit = data.unit || product.unit;
    existing.unitCost = data.purchasePrice;
    existing.totalAmount = Number((data.quantity * data.purchasePrice).toFixed(2));
    existing.supplierId = data.supplierId ? parseObjectId(data.supplierId, 'supplierId') : null;
    existing.invoiceNumber = data.invoiceNumber;
    existing.notes = data.notes;
    existing.attachmentUrl = data.attachmentUrl;
    if (data.transactionDate) existing.transactionDate = new Date(data.transactionDate);
    await existing.save();

    res.json({ transaction: existing });
  })
);

router.post(
  '/:id/confirm',
  requirePermission('STOCK_IN_CONFIRM'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transactionId');

    const confirmed = await runInTransaction(async (session) => {
      const tx = await StockTransaction.findById(id).session(session);
      if (!tx) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
      if (tx.direction !== 'IN' || tx.status !== 'Draft') {
        throw Object.assign(new Error('Only Draft Stock In transactions can be confirmed'), {
          statusCode: 400,
        });
      }
      assertWarehouseAccess(req.user!, tx.warehouseId);

      const [product, warehouse] = await Promise.all([
        Product.findById(tx.productId).session(session).lean(),
        Warehouse.findById(tx.warehouseId).session(session).lean(),
      ]);
      if (!product || !warehouse) {
        throw Object.assign(new Error('Referenced product or warehouse not found'), { statusCode: 404 });
      }

      const invResult = await applyStockIncrease({
        warehouseId: tx.warehouseId,
        productId: tx.productId,
        quantity: tx.quantity,
        unitCost: tx.unitCost,
        session,
      });

      tx.status = 'Confirmed';
      tx.ledgerPosted = true;
      tx.previousQuantity = invResult.previousQty;
      tx.quantityIn = tx.quantity;
      tx.quantityOut = 0;
      tx.newQuantity = invResult.newQty;
      tx.confirmedBy = parseObjectId(req.user!.id, 'userId');
      tx.confirmedAt = new Date();
      await tx.save(session ? { session } : undefined);

      await createNotification({
        type: 'STOCK_IN',
        title: `Stock In Confirmed (${tx.transactionNumber})`,
        titleSo: `Alaab Soo Gashay waa la xaqiijiyay (${tx.transactionNumber})`,
        message: `Received ${tx.quantity} ${tx.unit} of ${product.name} into ${warehouse.name}.`,
        messageSo: `Waxaa la helay ${tx.quantity} ${tx.unit} oo ah ${product.name} laguna daray ${warehouse.name}.`,
        warehouseId: tx.warehouseId,
        productId: tx.productId,
        referenceNumber: tx.transactionNumber,
        session,
      });

      await recordAuditLog({
        actor: req.user!,
        action: 'CONFIRM_STOCK_IN',
        entityType: 'StockIn',
        entityId: String(tx._id),
        entityRef: tx.transactionNumber,
        warehouseId: tx.warehouseId,
        details: { productId: String(tx.productId), quantity: tx.quantity, unitCost: tx.unitCost },
        ipAddress: req.ip || '',
        session,
      });

      return tx;
    });

    res.json({ transaction: confirmed });
  })
);

router.delete(
  '/:id',
  requirePermission('STOCK_IN_CREATE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'transactionId');
    const tx = await StockTransaction.findById(id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status === 'Confirmed' || tx.ledgerPosted) {
      return res.status(400).json({
        error: 'Completed stock transactions cannot be deleted permanently. Use a Stock Adjustment instead.',
      });
    }
    assertWarehouseAccess(req.user!, tx.warehouseId);
    await StockTransaction.deleteOne({ _id: id });
    res.json({ deleted: true });
  })
);

export default router;

import { Router } from 'express';
import mongoose from 'mongoose';
import {
  Inventory,
  StockTransaction,
  StockTransfer,
  StockAdjustment,
  StockCount,
  AuditLog,
} from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
} from '../middleware/auth';
import { asyncHandler, parseObjectId, safeString } from '../utils/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/ledger',
  requirePermission('INVENTORY_VIEW', 'REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const warehouseId = safeString(req.query.warehouseId);
    const productId = safeString(req.query.productId);
    const movementType = safeString(req.query.movementType);
    const startDate = safeString(req.query.startDate);
    const endDate = safeString(req.query.endDate);

    const filter: Record<string, unknown> = { status: 'Confirmed', ledgerPosted: true };
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ entries: [] });
      filter.warehouseId = new mongoose.Types.ObjectId(user.assignedWarehouseId);
    } else if (warehouseId && warehouseId !== 'ALL') {
      filter.warehouseId = parseObjectId(warehouseId, 'warehouseId');
    }

    if (productId && productId !== 'ALL') {
      filter.productId = parseObjectId(productId, 'productId');
    }
    if (movementType && movementType !== 'ALL') {
      filter.movementType = movementType;
    }
    if (startDate || endDate) {
      const range: Record<string, Date> = {};
      if (startDate) range.$gte = new Date(startDate);
      if (endDate) range.$lte = new Date(`${endDate}T23:59:59.999Z`);
      filter.transactionDate = range;
    }

    const entries = await StockTransaction.find(filter)
      .sort({ transactionDate: -1 })
      .limit(300)
      .populate('productId', 'name sku unit')
      .populate('warehouseId', 'name code')
      .populate('performedBy', 'fullName')
      .lean();

    res.json({ entries });
  })
);

router.get(
  '/:reportType',
  requirePermission('REPORTS_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const reportType = safeString(req.params.reportType);
    const warehouseIdParam = safeString(req.query.warehouseId);
    const productIdParam = safeString(req.query.productId);
    const categoryIdParam = safeString(req.query.categoryId);
    const employeeIdParam = safeString(req.query.employeeId);
    const movementTypeParam = safeString(req.query.movementType);
    const startDate = safeString(req.query.startDate);
    const endDate = safeString(req.query.endDate);

    let scopedWarehouseId: mongoose.Types.ObjectId | null = null;
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ rows: [], summary: {} });
      scopedWarehouseId = new mongoose.Types.ObjectId(user.assignedWarehouseId);
    } else if (warehouseIdParam && warehouseIdParam !== 'ALL') {
      scopedWarehouseId = parseObjectId(warehouseIdParam, 'warehouseId');
    }

    const dateRange: Record<string, Date> = {};
    if (startDate) dateRange.$gte = new Date(startDate);
    if (endDate) dateRange.$lte = new Date(`${endDate}T23:59:59.999Z`);

    if (
      [
        'global-inventory',
        'warehouse-stock',
        'low-stock',
        'out-of-stock',
        'valuation',
      ].includes(reportType)
    ) {
      const invMatch: Record<string, unknown> = {};
      if (scopedWarehouseId) invMatch.warehouseId = scopedWarehouseId;
      if (productIdParam && productIdParam !== 'ALL') {
        invMatch.productId = parseObjectId(productIdParam, 'productId');
      }

      const records = await Inventory.find(invMatch)
        .populate({ path: 'productId', populate: { path: 'categoryId', select: 'name' } })
        .populate('warehouseId', 'name code location')
        .lean();

      const rows = records
        .map((r) => {
          const prod = r.productId as unknown as {
            _id: mongoose.Types.ObjectId;
            name: string;
            sku: string;
            unit: string;
            minStockLevel: number;
            sellingPrice: number;
            categoryId?: { _id: mongoose.Types.ObjectId; name: string };
          } | null;
          const wh = r.warehouseId as unknown as {
            _id: mongoose.Types.ObjectId;
            name: string;
            code: string;
          } | null;
          if (!prod || !wh) return null;

          const status =
            r.availableQty <= 0
              ? 'Out of Stock'
              : r.availableQty <= prod.minStockLevel
              ? 'Low Stock'
              : 'In Stock';

          return {
            warehouse: `${wh.name} (${wh.code})`,
            sku: prod.sku,
            product: prod.name,
            category: prod.categoryId?.name || 'Uncategorized',
            categoryId: prod.categoryId?._id ? String(prod.categoryId._id) : '',
            unit: prod.unit,
            availableQty: Number(r.availableQty.toFixed(2)),
            reservedQty: Number(r.reservedQty.toFixed(2)),
            minStockLevel: prod.minStockLevel,
            averageCost: Number(r.averageCost.toFixed(2)),
            totalValue: Number(r.totalValue.toFixed(2)),
            status,
          };
        })
        .filter((row): row is NonNullable<typeof row> => {
          if (!row) return false;
          if (categoryIdParam && categoryIdParam !== 'ALL' && row.categoryId !== categoryIdParam) {
            return false;
          }
          if (reportType === 'low-stock' && row.status !== 'Low Stock') return false;
          if (reportType === 'out-of-stock' && row.status !== 'Out of Stock') return false;
          return true;
        });

      const totalQty = rows.reduce((s, r) => s + r.availableQty, 0);
      const totalVal = rows.reduce((s, r) => s + r.totalValue, 0);

      return res.json({
        rows,
        summary: {
          recordCount: rows.length,
          totalQty: Number(totalQty.toFixed(2)),
          totalValue: Number(totalVal.toFixed(2)),
        },
      });
    }

    if (['stock-in', 'stock-out', 'product-movement'].includes(reportType)) {
      const txMatch: Record<string, unknown> = { status: 'Confirmed', ledgerPosted: true };
      if (scopedWarehouseId) txMatch.warehouseId = scopedWarehouseId;
      if (productIdParam && productIdParam !== 'ALL') {
        txMatch.productId = parseObjectId(productIdParam, 'productId');
      }
      if (employeeIdParam && employeeIdParam !== 'ALL') {
        txMatch.performedBy = parseObjectId(employeeIdParam, 'employeeId');
      }
      if (Object.keys(dateRange).length > 0) txMatch.transactionDate = dateRange;

      if (reportType === 'stock-in') {
        txMatch.movementType = { $in: ['Stock In', 'Opening Balance'] };
      } else if (reportType === 'stock-out') {
        txMatch.movementType = 'Stock Out';
      } else if (movementTypeParam && movementTypeParam !== 'ALL') {
        txMatch.movementType = movementTypeParam;
      }

      const txs = await StockTransaction.find(txMatch)
        .sort({ transactionDate: -1 })
        .limit(500)
        .populate('warehouseId', 'name code')
        .populate('productId', 'name sku unit')
        .populate('performedBy', 'fullName')
        .lean();

      const rows = txs.map((t) => {
        const wh = t.warehouseId as unknown as { name: string; code: string } | null;
        const prod = t.productId as unknown as { name: string; sku: string; unit: string } | null;
        const usr = t.performedBy as unknown as { fullName: string } | null;
        return {
          transactionNumber: t.transactionNumber,
          date: t.transactionDate,
          warehouse: wh ? `${wh.name} (${wh.code})` : '-',
          sku: prod?.sku || '-',
          product: prod?.name || '-',
          movementType: t.movementType,
          quantityIn: t.quantityIn,
          quantityOut: t.quantityOut,
          unitCost: Number((t.unitCost || 0).toFixed(2)),
          totalAmount: Number((t.totalAmount || 0).toFixed(2)),
          user: usr?.fullName || '-',
          reference: t.referenceNumber || '-',
        };
      });

      return res.json({
        rows,
        summary: {
          recordCount: rows.length,
          totalIn: Number(rows.reduce((s, r) => s + r.quantityIn, 0).toFixed(2)),
          totalOut: Number(rows.reduce((s, r) => s + r.quantityOut, 0).toFixed(2)),
          totalValue: Number(rows.reduce((s, r) => s + r.totalAmount, 0).toFixed(2)),
        },
      });
    }

    if (reportType === 'transfers') {
      const trfMatch: Record<string, unknown> = {};
      if (scopedWarehouseId) {
        trfMatch.$or = [
          { sourceWarehouseId: scopedWarehouseId },
          { destinationWarehouseId: scopedWarehouseId },
        ];
      }
      if (productIdParam && productIdParam !== 'ALL') {
        trfMatch.productId = parseObjectId(productIdParam, 'productId');
      }
      if (Object.keys(dateRange).length > 0) trfMatch.transferDate = dateRange;

      const list = await StockTransfer.find(trfMatch)
        .sort({ transferDate: -1 })
        .populate('sourceWarehouseId', 'name code')
        .populate('destinationWarehouseId', 'name code')
        .populate('productId', 'name sku unit')
        .populate('requestedBy', 'fullName')
        .lean();

      const rows = list.map((t) => {
        const src = t.sourceWarehouseId as unknown as { name: string } | null;
        const dst = t.destinationWarehouseId as unknown as { name: string } | null;
        const prod = t.productId as unknown as { name: string; sku: string } | null;
        const reqBy = t.requestedBy as unknown as { fullName: string } | null;
        return {
          transferNumber: t.transferNumber,
          date: t.transferDate,
          source: src?.name || '-',
          destination: dst?.name || '-',
          product: prod ? `${prod.name} (${prod.sku})` : '-',
          requestedQty: t.quantity,
          receivedQty: t.receivedQuantity,
          damagedQty: t.damagedQuantity,
          missingQty: t.missingQuantity,
          status: t.status,
          requestedBy: reqBy?.fullName || '-',
        };
      });
      return res.json({ rows, summary: { recordCount: rows.length } });
    }

    if (reportType === 'adjustments') {
      const adjMatch: Record<string, unknown> = {};
      if (scopedWarehouseId) adjMatch.warehouseId = scopedWarehouseId;
      if (Object.keys(dateRange).length > 0) adjMatch.adjustmentDate = dateRange;

      const list = await StockAdjustment.find(adjMatch)
        .sort({ adjustmentDate: -1 })
        .populate('warehouseId', 'name')
        .populate('productId', 'name sku')
        .populate('adjustedBy', 'fullName')
        .lean();

      const rows = list.map((a) => ({
        adjustmentNumber: a.adjustmentNumber,
        date: a.adjustmentDate,
        warehouse: (a.warehouseId as unknown as { name: string })?.name || '-',
        product: (a.productId as unknown as { name: string })?.name || '-',
        type: a.adjustmentType,
        previousQty: a.previousQuantity,
        adjustmentQty: a.adjustmentQuantity,
        newQty: a.newQuantity,
        reason: a.reason,
        status: a.status,
        adjustedBy: (a.adjustedBy as unknown as { fullName: string })?.fullName || '-',
      }));
      return res.json({ rows, summary: { recordCount: rows.length } });
    }

    if (reportType === 'stock-counts') {
      const cntMatch: Record<string, unknown> = {};
      if (scopedWarehouseId) cntMatch.warehouseId = scopedWarehouseId;
      if (Object.keys(dateRange).length > 0) cntMatch.countDate = dateRange;

      const list = await StockCount.find(cntMatch)
        .sort({ countDate: -1 })
        .populate('warehouseId', 'name')
        .populate('countedBy', 'fullName')
        .lean();

      const rows = list.map((c) => ({
        countNumber: c.countNumber,
        date: c.countDate,
        warehouse: (c.warehouseId as unknown as { name: string })?.name || '-',
        itemsCounted: c.items.length,
        totalVariance: c.items.reduce((s: number, i: { difference: number }) => s + Math.abs(i.difference), 0),
        status: c.status,
        countedBy: (c.countedBy as unknown as { fullName: string })?.fullName || '-',
      }));
      return res.json({ rows, summary: { recordCount: rows.length } });
    }

    if (reportType === 'employee-activity') {
      const logMatch: Record<string, unknown> = {};
      if (scopedWarehouseId) logMatch.warehouseId = scopedWarehouseId;
      if (employeeIdParam && employeeIdParam !== 'ALL') {
        logMatch.actorId = parseObjectId(employeeIdParam, 'actorId');
      }
      if (Object.keys(dateRange).length > 0) logMatch.createdAt = dateRange;

      const logs = await AuditLog.find(logMatch).sort({ createdAt: -1 }).limit(300).lean();
      const rows = logs.map((l) => ({
        date: l.createdAt,
        employee: l.actorName,
        role: l.actorRole,
        action: l.action,
        entityType: l.entityType,
        reference: l.entityRef || '-',
      }));
      return res.json({ rows, summary: { recordCount: rows.length } });
    }

    return res.status(400).json({ error: 'Unknown report type' });
  })
);

export default router;

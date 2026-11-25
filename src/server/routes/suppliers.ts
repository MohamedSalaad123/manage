import { Router } from 'express';
import { z } from 'zod';
import { Supplier, StockTransaction } from '../models';
import { authenticate, requirePermission } from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { asyncHandler, escapeRegex, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const supplierSchema = z.object({
  supplierName: z.string().min(2).max(140),
  companyName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(120),
  phone: z.string().min(3).max(40),
  email: z.string().email().optional().or(z.literal('')).default(''),
  address: z.string().max(250).optional().default(''),
  notes: z.string().max(500).optional().default(''),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = safeString(req.query.search);
    const filter: Record<string, unknown> = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ supplierName: rx }, { companyName: rx }, { contactPerson: rx }];
    }

    const suppliers = await Supplier.find(filter).sort({ createdAt: -1 }).lean();
    const agg = await StockTransaction.aggregate([
      {
        $match: {
          supplierId: { $ne: null },
          status: 'Confirmed',
          direction: 'IN',
        },
      },
      {
        $group: {
          _id: '$supplierId',
          totalPurchaseValue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          productsSupplied: { $addToSet: '$productId' },
        },
      },
    ]);

    const aggMap = new Map(agg.map((a) => [String(a._id), a]));
    const enriched = suppliers.map((s) => {
      const st = aggMap.get(String(s._id));
      return {
        ...s,
        totalPurchaseValue: Number((st?.totalPurchaseValue || 0).toFixed(2)),
        totalOrders: st?.totalOrders || 0,
        productCount: st?.productsSupplied?.length || 0,
      };
    });

    res.json({ suppliers: enriched });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'supplierId');
    const supplier = await Supplier.findById(id).lean();
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const transactions = await StockTransaction.find({
      supplierId: id,
      status: 'Confirmed',
    })
      .sort({ transactionDate: -1 })
      .populate('productId', 'name sku unit')
      .populate('warehouseId', 'name code')
      .lean();

    const totalPurchaseValue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const uniqueProducts = new Map<string, { name: string; sku: string; totalQty: number; totalValue: number }>();

    for (const tx of transactions) {
      const prod = tx.productId as unknown as { _id: string; name: string; sku: string } | null;
      if (!prod) continue;
      const pid = String(prod._id);
      const prev = uniqueProducts.get(pid) || { name: prod.name, sku: prod.sku, totalQty: 0, totalValue: 0 };
      prev.totalQty += tx.quantity;
      prev.totalValue += tx.totalAmount || 0;
      uniqueProducts.set(pid, prev);
    }

    res.json({
      supplier,
      totalPurchaseValue: Number(totalPurchaseValue.toFixed(2)),
      productsSupplied: Array.from(uniqueProducts.values()),
      purchaseHistory: transactions,
    });
  })
);

router.post(
  '/',
  requirePermission('SUPPLIER_MANAGE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(supplierSchema, req.body);
    const supplier = await Supplier.create(data);
    await recordAuditLog({
      actor: req.user!,
      action: 'CREATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: String(supplier._id),
      entityRef: supplier.supplierName,
      ipAddress: req.ip || '',
    });
    res.status(201).json({ supplier });
  })
);

router.put(
  '/:id',
  requirePermission('SUPPLIER_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'supplierId');
    const data = validateBody(supplierSchema, req.body);
    const supplier = await Supplier.findByIdAndUpdate(id, data, { new: true });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    await recordAuditLog({
      actor: req.user!,
      action: 'UPDATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: String(supplier._id),
      entityRef: supplier.supplierName,
      ipAddress: req.ip || '',
    });
    res.json({ supplier });
  })
);

export default router;

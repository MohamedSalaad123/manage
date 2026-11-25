import { Router } from 'express';
import { z } from 'zod';
import { Product, Inventory, StockTransaction } from '../models';
import { authenticate, requirePermission, canAccessAllWarehouses } from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { asyncHandler, escapeRegex, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const productSchema = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().min(2).max(60),
  barcode: z.string().max(80).optional().default(''),
  categoryId: z.string().min(1),
  brand: z.string().max(100).optional().default(''),
  unit: z.string().min(1).max(40),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  minStockLevel: z.number().min(0),
  imageUrl: z.string().max(500).optional().default(''),
  description: z.string().max(800).optional().default(''),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
});

router.get(
  '/',
  requirePermission('PRODUCT_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const search = safeString(req.query.search);
    const categoryId = safeString(req.query.categoryId);
    const status = safeString(req.query.status);

    const filter: Record<string, unknown> = {};
    if (categoryId && categoryId !== 'ALL') {
      filter.categoryId = parseObjectId(categoryId, 'categoryId');
    }
    if (status && ['Active', 'Inactive'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { brand: rx }];
    }

    const products = await Product.find(filter)
      .populate('categoryId', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    const invMatch: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user) && user.assignedWarehouseId) {
      invMatch.warehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    }

    const invAgg = await Inventory.aggregate([
      { $match: invMatch },
      {
        $group: {
          _id: '$productId',
          totalQuantity: { $sum: '$availableQty' },
          totalReserved: { $sum: '$reservedQty' },
          totalValue: { $sum: '$totalValue' },
          warehouseCount: { $sum: 1 },
        },
      },
    ]);
    const invMap = new Map(invAgg.map((i) => [String(i._id), i]));

    const enriched = products.map((p) => {
      const stats = invMap.get(String(p._id));
      return {
        ...p,
        globalQuantity: Number((stats?.totalQuantity || 0).toFixed(2)),
        globalReserved: Number((stats?.totalReserved || 0).toFixed(2)),
        globalValuation: Number((stats?.totalValue || 0).toFixed(2)),
        warehouseCount: stats?.warehouseCount || 0,
      };
    });

    res.json({ products: enriched });
  })
);

router.get(
  '/:id',
  requirePermission('PRODUCT_VIEW'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'productId');
    const user = req.user!;

    const product = await Product.findById(id).populate('categoryId', 'name code').lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const scopeMatch: Record<string, unknown> = { productId: id };
    if (!canAccessAllWarehouses(user) && user.assignedWarehouseId) {
      scopeMatch.warehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    }

    const [warehouseStocks, history] = await Promise.all([
      Inventory.find(scopeMatch).populate('warehouseId', 'name code location status').lean(),
      StockTransaction.find({ ...scopeMatch, status: 'Confirmed', ledgerPosted: true })
        .sort({ transactionDate: -1 })
        .limit(60)
        .populate('warehouseId', 'name code')
        .populate('performedBy', 'fullName')
        .lean(),
    ]);

    const totalQuantity = warehouseStocks.reduce((acc, s) => acc + (s.availableQty || 0), 0);
    const totalValuation = warehouseStocks.reduce((acc, s) => acc + (s.totalValue || 0), 0);

    res.json({
      product,
      totalQuantity: Number(totalQuantity.toFixed(2)),
      totalValuation: Number(totalValuation.toFixed(2)),
      warehouseStocks,
      history,
    });
  })
);

router.post(
  '/',
  requirePermission('PRODUCT_MANAGE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(productSchema, req.body);
    const sku = data.sku.trim().toUpperCase();

    const exists = await Product.findOne({ sku });
    if (exists) {
      return res.status(409).json({ error: `Product SKU ${sku} already exists` });
    }

    const product = await Product.create({
      ...data,
      sku,
      categoryId: parseObjectId(data.categoryId, 'categoryId'),
    });

    await recordAuditLog({
      actor: req.user!,
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: String(product._id),
      entityRef: product.sku,
      details: { name: product.name, unit: product.unit, purchasePrice: product.purchasePrice },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ product });
  })
);

router.put(
  '/:id',
  requirePermission('PRODUCT_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'productId');
    const data = validateBody(productSchema, req.body);
    const sku = data.sku.trim().toUpperCase();

    const duplicate = await Product.findOne({ sku, _id: { $ne: id } });
    if (duplicate) {
      return res.status(409).json({ error: `Product SKU ${sku} already exists` });
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      {
        ...data,
        sku,
        categoryId: parseObjectId(data.categoryId, 'categoryId'),
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });

    await recordAuditLog({
      actor: req.user!,
      action: 'UPDATE_PRODUCT',
      entityType: 'Product',
      entityId: String(updated._id),
      entityRef: updated.sku,
      details: { name: updated.name, purchasePrice: updated.purchasePrice, sellingPrice: updated.sellingPrice },
      ipAddress: req.ip || '',
    });

    res.json({ product: updated });
  })
);

export default router;

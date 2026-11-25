import { Router } from 'express';
import { z } from 'zod';
import { Category, Product } from '../models';
import { authenticate, requirePermission } from '../middleware/auth';
import { recordAuditLog } from '../services/auditService';
import { asyncHandler, parseObjectId, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const categorySchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(30),
  description: z.string().max(300).optional().default(''),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json({ categories });
  })
);

router.post(
  '/',
  requirePermission('PRODUCT_MANAGE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(categorySchema, req.body);
    const code = data.code.trim().toUpperCase();
    const existing = await Category.findOne({ $or: [{ name: data.name }, { code }] });
    if (existing) return res.status(409).json({ error: 'Category name or code already exists' });

    const category = await Category.create({ ...data, code });
    await recordAuditLog({
      actor: req.user!,
      action: 'CREATE_CATEGORY',
      entityType: 'Category',
      entityId: String(category._id),
      entityRef: category.code,
      ipAddress: req.ip || '',
    });
    res.status(201).json({ category });
  })
);

router.put(
  '/:id',
  requirePermission('PRODUCT_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'categoryId');
    const data = validateBody(categorySchema, req.body);
    const updated = await Category.findByIdAndUpdate(
      id,
      { ...data, code: data.code.trim().toUpperCase() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    res.json({ category: updated });
  })
);

router.delete(
  '/:id',
  requirePermission('PRODUCT_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'categoryId');
    const inUse = await Product.exists({ categoryId: id });
    if (inUse) {
      return res.status(400).json({ error: 'Cannot delete category assigned to existing products' });
    }
    await Category.deleteOne({ _id: id });
    res.json({ deleted: true });
  })
);

export default router;

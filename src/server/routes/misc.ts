import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import {
  Warehouse,
  Product,
  StockTransaction,
  StockTransfer,
  Supplier,
} from '../models';
import { authenticate, canAccessAllWarehouses } from '../middleware/auth';
import { asyncHandler, escapeRegex, parseObjectId, safeString } from '../utils/validation';

const router = Router();
router.use(authenticate);

// Ensure upload directory exists cleanly inside runtime storage
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${allowedExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF'));
  },
});

router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  })
);

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = safeString(req.query.q);
    if (!q || q.length < 2) {
      return res.json({ warehouses: [], products: [], transactions: [], transfers: [], suppliers: [] });
    }

    const user = req.user!;
    const rx = new RegExp(escapeRegex(q), 'i');
    const whScope =
      !canAccessAllWarehouses(user) && user.assignedWarehouseId
        ? { warehouseId: parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId') }
        : {};

    const [warehouses, products, transactions, transfers, suppliers] = await Promise.all([
      Warehouse.find({
        ...(whScope.warehouseId ? { _id: whScope.warehouseId } : {}),
        $or: [{ name: rx }, { code: rx }, { location: rx }],
      })
        .limit(5)
        .select('name code location status')
        .lean(),
      Product.find({ $or: [{ name: rx }, { sku: rx }, { barcode: rx }] })
        .limit(6)
        .select('name sku unit sellingPrice')
        .lean(),
      StockTransaction.find({
        ...whScope,
        $or: [{ transactionNumber: rx }, { invoiceNumber: rx }, { referenceNumber: rx }],
      })
        .limit(5)
        .select('transactionNumber movementType status quantity transactionDate')
        .lean(),
      StockTransfer.find({
        ...(whScope.warehouseId
          ? {
              $or: [
                { sourceWarehouseId: whScope.warehouseId },
                { destinationWarehouseId: whScope.warehouseId },
              ],
            }
          : {}),
        transferNumber: rx,
      })
        .limit(5)
        .select('transferNumber status quantity')
        .lean(),
      Supplier.find({ $or: [{ supplierName: rx }, { companyName: rx }] })
        .limit(5)
        .select('supplierName companyName phone')
        .lean(),
    ]);

    res.json({ warehouses, products, transactions, transfers, suppliers });
  })
);

export default router;

import { Router } from 'express';
import mongoose from 'mongoose';
import { Inventory, Warehouse } from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
} from '../middleware/auth';
import { asyncHandler, parseObjectId, safeString } from '../utils/validation';

const router = Router();
router.use(authenticate);

function getStockStatus(availableQty: number, minStockLevel: number) {
  if (availableQty <= 0) return 'Out of Stock';
  if (availableQty <= minStockLevel) return 'Low Stock';
  return 'In Stock';
}

router.get(
  '/',
  requirePermission('INVENTORY_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const warehouseIdParam = safeString(req.query.warehouseId);
    const productIdParam = safeString(req.query.productId);
    const categoryIdParam = safeString(req.query.categoryId);
    const statusParam = safeString(req.query.stockStatus);
    const search = safeString(req.query.search).toLowerCase();
    const viewMode = safeString(req.query.view) || 'warehouse';

    const match: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ items: [], globalItems: [] });
      match.warehouseId = new mongoose.Types.ObjectId(user.assignedWarehouseId);
    } else if (warehouseIdParam && warehouseIdParam !== 'ALL') {
      match.warehouseId = parseObjectId(warehouseIdParam, 'warehouseId');
    }

    if (productIdParam && productIdParam !== 'ALL') {
      match.productId = parseObjectId(productIdParam, 'productId');
    }

    const records = await Inventory.find(match)
      .populate({
        path: 'productId',
        populate: { path: 'categoryId', select: 'name code' },
      })
      .populate('warehouseId', 'name code location status')
      .sort({ updatedAt: -1 })
      .lean();

    const filtered = records
      .map((rec) => {
        const prod = rec.productId as unknown as {
          _id: mongoose.Types.ObjectId;
          name: string;
          sku: string;
          unit: string;
          purchasePrice: number;
          minStockLevel: number;
          categoryId?: { _id: mongoose.Types.ObjectId; name: string };
        } | null;
        const wh = rec.warehouseId as unknown as {
          _id: mongoose.Types.ObjectId;
          name: string;
          code: string;
          location: string;
        } | null;

        if (!prod || !wh) return null;
        const stockStatus = getStockStatus(rec.availableQty, prod.minStockLevel);

        return {
          _id: rec._id,
          productId: String(prod._id),
          productName: prod.name,
          sku: prod.sku,
          unit: prod.unit,
          categoryId: prod.categoryId?._id ? String(prod.categoryId._id) : '',
          categoryName: prod.categoryId?.name || 'Uncategorized',
          warehouseId: String(wh._id),
          warehouseName: wh.name,
          warehouseCode: wh.code,
          availableQty: Number(rec.availableQty.toFixed(2)),
          reservedQty: Number(rec.reservedQty.toFixed(2)),
          minStockLevel: prod.minStockLevel,
          purchasePrice: Number(rec.averageCost.toFixed(2)),
          catalogPurchasePrice: prod.purchasePrice,
          totalStockValue: Number(rec.totalValue.toFixed(2)),
          stockStatus,
          lastMovementAt: rec.lastMovementAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (!row) return false;
        if (categoryIdParam && categoryIdParam !== 'ALL' && row.categoryId !== categoryIdParam) {
          return false;
        }
        if (statusParam && statusParam !== 'ALL' && row.stockStatus !== statusParam) {
          return false;
        }
        if (
          search &&
          !row.productName.toLowerCase().includes(search) &&
          !row.sku.toLowerCase().includes(search) &&
          !row.warehouseName.toLowerCase().includes(search)
        ) {
          return false;
        }
        return true;
      });

    // Build Global View grouped by Product across warehouses
    let globalItems: Array<{
      productId: string;
      productName: string;
      sku: string;
      unit: string;
      categoryName: string;
      totalAvailableQty: number;
      totalReservedQty: number;
      weightedAverageCost: number;
      totalStockValue: number;
      minStockLevel: number;
      stockStatus: string;
      warehouses: Array<{
        warehouseId: string;
        warehouseName: string;
        warehouseCode: string;
        availableQty: number;
        reservedQty: number;
        totalValue: number;
      }>;
    }> = [];

    if (viewMode === 'global') {
      const allWarehouses = await Warehouse.find(
        canAccessAllWarehouses(user)
          ? {}
          : { _id: new mongoose.Types.ObjectId(user.assignedWarehouseId!) }
      ).lean();
      const whMap = new Map(allWarehouses.map((w) => [String(w._id), w]));

      const grouped = new Map<string, typeof globalItems[number]>();
      for (const item of filtered) {
        const existing = grouped.get(item.productId);
        const whDetail = {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          warehouseCode: item.warehouseCode,
          availableQty: item.availableQty,
          reservedQty: item.reservedQty,
          totalValue: item.totalStockValue,
        };

        if (!existing) {
          grouped.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            unit: item.unit,
            categoryName: item.categoryName,
            totalAvailableQty: item.availableQty,
            totalReservedQty: item.reservedQty,
            weightedAverageCost: item.purchasePrice,
            totalStockValue: item.totalStockValue,
            minStockLevel: item.minStockLevel,
            stockStatus: item.stockStatus,
            warehouses: [whDetail],
          });
        } else {
          existing.totalAvailableQty = Number((existing.totalAvailableQty + item.availableQty).toFixed(2));
          existing.totalReservedQty = Number((existing.totalReservedQty + item.reservedQty).toFixed(2));
          existing.totalStockValue = Number((existing.totalStockValue + item.totalStockValue).toFixed(2));
          const totalUnits = existing.totalAvailableQty + existing.totalReservedQty;
          existing.weightedAverageCost =
            totalUnits > 0 ? Number((existing.totalStockValue / totalUnits).toFixed(2)) : item.purchasePrice;
          existing.stockStatus = getStockStatus(existing.totalAvailableQty, existing.minStockLevel);
          if (whMap.has(item.warehouseId)) {
            existing.warehouses.push(whDetail);
          }
        }
      }
      globalItems = Array.from(grouped.values());
    }

    res.json({ items: filtered, globalItems });
  })
);

export default router;

import { Router } from 'express';
import mongoose from 'mongoose';
import {
  Warehouse,
  Product,
  Inventory,
  StockTransaction,
  StockTransfer,
  Employee,
} from '../models';
import { authenticate, canAccessAllWarehouses } from '../middleware/auth';
import { asyncHandler, parseObjectId, safeString } from '../utils/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const reqWarehouseId = safeString(req.query.warehouseId);
    const startDateStr = safeString(req.query.startDate);
    const endDateStr = safeString(req.query.endDate);

    let scopedWarehouseId: mongoose.Types.ObjectId | null = null;

    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) {
        return res.status(403).json({ error: 'No warehouse assigned to your account' });
      }
      scopedWarehouseId = new mongoose.Types.ObjectId(user.assignedWarehouseId);
    } else if (reqWarehouseId && reqWarehouseId !== 'ALL') {
      scopedWarehouseId = parseObjectId(reqWarehouseId, 'warehouseId');
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const endDate = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`) : endOfToday;

    const warehouseFilter = scopedWarehouseId ? { _id: scopedWarehouseId } : {};
    const invFilter = scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {};
    const empFilter = scopedWarehouseId ? { assignedWarehouseId: scopedWarehouseId } : {};

    const [
      totalWarehouses,
      activeWarehouses,
      totalProducts,
      totalEmployees,
      pendingTransfers,
      inventories,
      warehousesList,
    ] = await Promise.all([
      Warehouse.countDocuments(warehouseFilter),
      Warehouse.countDocuments({ ...warehouseFilter, status: 'Active' }),
      Product.countDocuments({ status: 'Active' }),
      Employee.countDocuments({ ...empFilter, status: 'Active' }),
      StockTransfer.countDocuments({
        ...(scopedWarehouseId
          ? {
              $or: [
                { sourceWarehouseId: scopedWarehouseId },
                { destinationWarehouseId: scopedWarehouseId },
              ],
            }
          : {}),
        status: { $in: ['Pending Approval', 'Approved', 'In Transit', 'Partially Received'] },
      }),
      Inventory.find(invFilter).populate('productId', 'name sku unit minStockLevel status').lean(),
      Warehouse.find(warehouseFilter).sort({ name: 1 }).lean(),
    ]);

    let totalStockQuantity = 0;
    let totalInventoryValue = 0;
    let lowStockProducts = 0;
    let outOfStockProducts = 0;

    const warehouseTotals = new Map<string, { qty: number; value: number }>();
    const productQtyMap = new Map<string, { name: string; sku: string; qty: number; value: number }>();

    for (const inv of inventories) {
      const prod = inv.productId as unknown as {
        _id: mongoose.Types.ObjectId;
        name: string;
        sku: string;
        minStockLevel: number;
      } | null;
      if (!prod) continue;

      const qty = inv.availableQty || 0;
      const val = inv.totalValue || 0;
      totalStockQuantity += qty;
      totalInventoryValue += val;

      if (qty <= 0) {
        outOfStockProducts += 1;
      } else if (qty <= prod.minStockLevel) {
        lowStockProducts += 1;
      }

      const whId = String(inv.warehouseId);
      const prevWh = warehouseTotals.get(whId) || { qty: 0, value: 0 };
      prevWh.qty += qty;
      prevWh.value += val;
      warehouseTotals.set(whId, prevWh);

      const pId = String(prod._id);
      const prevProd = productQtyMap.get(pId) || {
        name: prod.name,
        sku: prod.sku,
        qty: 0,
        value: 0,
      };
      prevProd.qty += qty;
      prevProd.value += val;
      productQtyMap.set(pId, prevProd);
    }

    // Today's Stock In and Stock Out
    const todayTxMatch: Record<string, unknown> = {
      status: 'Confirmed',
      ledgerPosted: true,
      transactionDate: { $gte: startOfToday, $lte: endOfToday },
      ...(scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {}),
    };

    const todayTxs = await StockTransaction.aggregate([
      { $match: todayTxMatch },
      {
        $group: {
          _id: '$movementType',
          totalQtyIn: { $sum: '$quantityIn' },
          totalQtyOut: { $sum: '$quantityOut' },
        },
      },
    ]);

    let totalStockInToday = 0;
    let totalStockOutToday = 0;
    for (const row of todayTxs) {
      if (row._id === 'Stock In' || row._id === 'Opening Balance' || row._id === 'Transfer In') {
        totalStockInToday += row.totalQtyIn || 0;
      }
      if (row._id === 'Stock Out' || row._id === 'Transfer Out') {
        totalStockOutToday += row.totalQtyOut || 0;
      }
    }

    // Chart 1 & 4: Stock In vs Stock Out + Monthly Movement
    const movementTxMatch: Record<string, unknown> = {
      status: 'Confirmed',
      ledgerPosted: true,
      transactionDate: { $gte: startDate, $lte: endDate },
      ...(scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {}),
    };

    const monthlyAgg = await StockTransaction.aggregate([
      { $match: movementTxMatch },
      {
        $group: {
          _id: {
            year: { $year: '$transactionDate' },
            month: { $month: '$transactionDate' },
          },
          stockIn: { $sum: '$quantityIn' },
          stockOut: { $sum: '$quantityOut' },
          valueIn: {
            $sum: {
              $cond: [{ $gt: ['$quantityIn', 0] }, '$totalAmount', 0],
            },
          },
          valueOut: {
            $sum: {
              $cond: [{ $gt: ['$quantityOut', 0] }, '$totalAmount', 0],
            },
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMovement = monthlyAgg.map((m) => ({
      period: `${monthNames[m._id.month - 1]} ${m._id.year}`,
      stockIn: Number((m.stockIn || 0).toFixed(2)),
      stockOut: Number((m.stockOut || 0).toFixed(2)),
      netMovement: Number(((m.stockIn || 0) - (m.stockOut || 0)).toFixed(2)),
      valueIn: Number((m.valueIn || 0).toFixed(2)),
      valueOut: Number((m.valueOut || 0).toFixed(2)),
    }));

    // Chart 2 & 5: Inventory Distribution & Valuation by Warehouse
    const warehouseDistribution = warehousesList.map((wh) => {
      const totals = warehouseTotals.get(String(wh._id)) || { qty: 0, value: 0 };
      return {
        warehouseId: String(wh._id),
        name: wh.name,
        code: wh.code,
        quantity: Number(totals.qty.toFixed(2)),
        valuation: Number(totals.value.toFixed(2)),
      };
    });

    // Chart 3: Top 10 Products by Stock Quantity
    const top10Products = Array.from(productQtyMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((p) => ({
        name: p.name.length > 22 ? `${p.name.slice(0, 22)}...` : p.name,
        fullName: p.name,
        sku: p.sku,
        quantity: Number(p.qty.toFixed(2)),
        value: Number(p.value.toFixed(2)),
      }));

    // Recent ledger movements for executive snapshot
    const recentMovements = await StockTransaction.find({
      status: 'Confirmed',
      ledgerPosted: true,
      ...(scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {}),
    })
      .sort({ transactionDate: -1 })
      .limit(8)
      .populate('warehouseId', 'name code')
      .populate('productId', 'name sku unit')
      .populate('performedBy', 'fullName')
      .lean();

    res.json({
      kpis: {
        totalWarehouses,
        activeWarehouses,
        totalProducts,
        totalStockQuantity: Number(totalStockQuantity.toFixed(2)),
        totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
        totalStockInToday: Number(totalStockInToday.toFixed(2)),
        totalStockOutToday: Number(totalStockOutToday.toFixed(2)),
        lowStockProducts,
        outOfStockProducts,
        pendingTransfers,
        totalEmployees,
      },
      charts: {
        stockInVsOut: monthlyMovement,
        warehouseDistribution,
        top10Products,
        monthlyMovement,
        warehouseValuation: warehouseDistribution,
      },
      recentMovements,
    });
  })
);

export default router;

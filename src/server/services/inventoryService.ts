import mongoose from 'mongoose';
import { Inventory, Product, StockTransaction, type MovementType } from '../models';
import { checkAndNotifyStockLevel } from './auditService';
import { generateDocumentNumber } from './sequenceService';

export async function getOrCreateInventory(
  productId: string | mongoose.Types.ObjectId,
  warehouseId: string | mongoose.Types.ObjectId,
  session: mongoose.ClientSession | null
) {
  let inv = await Inventory.findOne({ productId, warehouseId }).session(session);
  if (!inv) {
    const product = await Product.findById(productId).session(session).lean();
    const initialCost = product?.purchasePrice || 0;
    const created = await Inventory.create(
      [
        {
          productId,
          warehouseId,
          availableQty: 0,
          reservedQty: 0,
          averageCost: initialCost,
          totalValue: 0,
          lastMovementAt: new Date(),
        },
      ],
      session ? { session } : undefined
    );
    inv = created[0];
  }
  return inv;
}

/**
 * Moving Weighted Average Cost valuation on inbound stock:
 * newAvgCost = ((existingQty * existingAvgCost) + (incomingQty * incomingUnitCost)) / (existingQty + incomingQty)
 */
export async function applyStockIncrease(params: {
  warehouseId: string | mongoose.Types.ObjectId;
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
  unitCost?: number;
  session: mongoose.ClientSession | null;
}) {
  if (params.quantity <= 0) {
    throw Object.assign(new Error('Quantity must be greater than zero'), { statusCode: 400 });
  }

  const inv = await getOrCreateInventory(params.productId, params.warehouseId, params.session);
  const previousQty = inv.availableQty;
  const totalExistingUnits = inv.availableQty + inv.reservedQty;
  const incomingCost =
    typeof params.unitCost === 'number' && params.unitCost >= 0
      ? params.unitCost
      : inv.averageCost;

  const existingValue = totalExistingUnits * inv.averageCost;
  const incomingValue = params.quantity * incomingCost;
  const newTotalUnits = totalExistingUnits + params.quantity;

  const newAverageCost =
    newTotalUnits > 0 ? Number(((existingValue + incomingValue) / newTotalUnits).toFixed(4)) : incomingCost;

  inv.availableQty = Number((inv.availableQty + params.quantity).toFixed(4));
  inv.averageCost = newAverageCost;
  inv.totalValue = Number(((inv.availableQty + inv.reservedQty) * newAverageCost).toFixed(2));
  inv.lastMovementAt = new Date();
  await inv.save(params.session ? { session: params.session } : undefined);

  return {
    previousQty,
    newQty: inv.availableQty,
    averageCost: inv.averageCost,
    totalValue: inv.totalValue,
  };
}

export async function applyStockDecrease(params: {
  warehouseId: string | mongoose.Types.ObjectId;
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
  session: mongoose.ClientSession | null;
}) {
  if (params.quantity <= 0) {
    throw Object.assign(new Error('Quantity must be greater than zero'), { statusCode: 400 });
  }

  const inv = await Inventory.findOne({
    productId: params.productId,
    warehouseId: params.warehouseId,
  }).session(params.session);

  if (!inv || inv.availableQty < params.quantity) {
    const avail = inv?.availableQty ?? 0;
    throw Object.assign(
      new Error(`Insufficient available stock. Available: ${avail}, Requested: ${params.quantity}`),
      { statusCode: 400 }
    );
  }

  const previousQty = inv.availableQty;
  inv.availableQty = Number((inv.availableQty - params.quantity).toFixed(4));
  inv.totalValue = Number(((inv.availableQty + inv.reservedQty) * inv.averageCost).toFixed(2));
  inv.lastMovementAt = new Date();
  await inv.save(params.session ? { session: params.session } : undefined);

  await checkAndNotifyStockLevel({
    productId: params.productId,
    warehouseId: params.warehouseId,
    newAvailableQty: inv.availableQty,
    session: params.session,
  });

  return {
    previousQty,
    newQty: inv.availableQty,
    averageCost: inv.averageCost,
    totalValue: inv.totalValue,
  };
}

export async function reserveStockForTransfer(params: {
  warehouseId: string | mongoose.Types.ObjectId;
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
  session: mongoose.ClientSession | null;
}) {
  const inv = await Inventory.findOne({
    productId: params.productId,
    warehouseId: params.warehouseId,
  }).session(params.session);

  if (!inv || inv.availableQty < params.quantity) {
    const avail = inv?.availableQty ?? 0;
    throw Object.assign(
      new Error(`Insufficient stock in source warehouse. Available: ${avail}, Requested: ${params.quantity}`),
      { statusCode: 400 }
    );
  }

  inv.availableQty = Number((inv.availableQty - params.quantity).toFixed(4));
  inv.reservedQty = Number((inv.reservedQty + params.quantity).toFixed(4));
  inv.totalValue = Number(((inv.availableQty + inv.reservedQty) * inv.averageCost).toFixed(2));
  await inv.save(params.session ? { session: params.session } : undefined);

  return inv;
}

export async function releaseReservedStock(params: {
  warehouseId: string | mongoose.Types.ObjectId;
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
  session: mongoose.ClientSession | null;
}) {
  const inv = await Inventory.findOne({
    productId: params.productId,
    warehouseId: params.warehouseId,
  }).session(params.session);
  if (!inv) return;

  const releaseAmt = Math.min(inv.reservedQty, params.quantity);
  inv.reservedQty = Number((inv.reservedQty - releaseAmt).toFixed(4));
  inv.availableQty = Number((inv.availableQty + releaseAmt).toFixed(4));
  inv.totalValue = Number(((inv.availableQty + inv.reservedQty) * inv.averageCost).toFixed(2));
  await inv.save(params.session ? { session: params.session } : undefined);
}

export async function dispatchReservedStock(params: {
  warehouseId: string | mongoose.Types.ObjectId;
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
  session: mongoose.ClientSession | null;
}) {
  const inv = await Inventory.findOne({
    productId: params.productId,
    warehouseId: params.warehouseId,
  }).session(params.session);

  if (!inv) {
    throw Object.assign(new Error('Source inventory record not found'), { statusCode: 400 });
  }

  const previousTotal = inv.availableQty + inv.reservedQty;
  if (inv.reservedQty >= params.quantity) {
    inv.reservedQty = Number((inv.reservedQty - params.quantity).toFixed(4));
  } else if (inv.availableQty + inv.reservedQty >= params.quantity) {
    const remainingFromAvail = params.quantity - inv.reservedQty;
    inv.reservedQty = 0;
    inv.availableQty = Number((inv.availableQty - remainingFromAvail).toFixed(4));
  } else {
    throw Object.assign(new Error('Insufficient stock in source warehouse for dispatch'), {
      statusCode: 400,
    });
  }

  inv.totalValue = Number(((inv.availableQty + inv.reservedQty) * inv.averageCost).toFixed(2));
  inv.lastMovementAt = new Date();
  await inv.save(params.session ? { session: params.session } : undefined);

  await checkAndNotifyStockLevel({
    productId: params.productId,
    warehouseId: params.warehouseId,
    newAvailableQty: inv.availableQty,
    session: params.session,
  });

  return {
    previousQty: previousTotal,
    newQty: inv.availableQty + inv.reservedQty,
    averageCost: inv.averageCost,
  };
}

export async function recordLedgerEntry(params: {
  direction: 'IN' | 'OUT' | 'LEDGER';
  movementType: MovementType;
  warehouseId: string | mongoose.Types.ObjectId;
  productId: string | mongoose.Types.ObjectId;
  quantity: number;
  unit: string;
  unitCost: number;
  previousQuantity: number;
  quantityIn: number;
  quantityOut: number;
  newQuantity: number;
  referenceNumber: string;
  reason?: string;
  notes?: string;
  performedBy: string | mongoose.Types.ObjectId;
  relatedTransferId?: string | mongoose.Types.ObjectId | null;
  relatedAdjustmentId?: string | mongoose.Types.ObjectId | null;
  session: mongoose.ClientSession | null;
}) {
  const doc = {
    transactionNumber: generateDocumentNumber('LED'),
    direction: params.direction,
    movementType: params.movementType,
    status: 'Confirmed' as const,
    ledgerPosted: true,
    warehouseId: params.warehouseId,
    productId: params.productId,
    quantity: params.quantity,
    unit: params.unit,
    unitCost: params.unitCost,
    totalAmount: Number((params.quantity * params.unitCost).toFixed(2)),
    previousQuantity: params.previousQuantity,
    quantityIn: params.quantityIn,
    quantityOut: params.quantityOut,
    newQuantity: params.newQuantity,
    referenceNumber: params.referenceNumber,
    reason: params.reason || '',
    notes: params.notes || '',
    transactionDate: new Date(),
    performedBy: params.performedBy,
    confirmedBy: params.performedBy,
    confirmedAt: new Date(),
    relatedTransferId: params.relatedTransferId || null,
    relatedAdjustmentId: params.relatedAdjustmentId || null,
  };

  if (params.session) {
    await StockTransaction.create([doc], { session: params.session });
  } else {
    await StockTransaction.create(doc);
  }
}

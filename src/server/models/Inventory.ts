import mongoose, { Schema, Document } from 'mongoose';

export interface IInventory extends Document {
  productId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  availableQty: number;
  reservedQty: number;
  averageCost: number;
  totalValue: number;
  lastMovementAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    availableQty: { type: Number, required: true, min: 0, default: 0 },
    reservedQty: { type: Number, required: true, min: 0, default: 0 },
    averageCost: { type: Number, required: true, min: 0, default: 0 },
    totalValue: { type: Number, required: true, min: 0, default: 0 },
    lastMovementAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'inventories' }
);

// Unique inventory record per Product + Warehouse combination
inventorySchema.index({ productId: 1, warehouseId: 1 }, { unique: true });

export const Inventory =
  mongoose.models.Inventory || mongoose.model<IInventory>('Inventory', inventorySchema);

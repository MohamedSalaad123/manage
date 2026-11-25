import mongoose, { Schema, Document } from 'mongoose';

export type AdjustmentType =
  | 'Increase Stock'
  | 'Decrease Stock'
  | 'Damaged Stock'
  | 'Lost Stock'
  | 'Physical Count Correction';

export interface IStockAdjustment extends Document {
  adjustmentNumber: string;
  warehouseId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  adjustmentType: AdjustmentType;
  previousQuantity: number;
  adjustmentQuantity: number;
  newQuantity: number;
  reason: string;
  notes?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  adjustedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  adjustmentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    adjustmentNumber: { type: String, required: true, unique: true, trim: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    adjustmentType: {
      type: String,
      enum: [
        'Increase Stock',
        'Decrease Stock',
        'Damaged Stock',
        'Lost Stock',
        'Physical Count Correction',
      ],
      required: true,
    },
    previousQuantity: { type: Number, required: true, min: 0 },
    adjustmentQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    adjustedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    adjustmentDate: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'stockAdjustments' }
);

export const StockAdjustment =
  mongoose.models.StockAdjustment ||
  mongoose.model<IStockAdjustment>('StockAdjustment', stockAdjustmentSchema);

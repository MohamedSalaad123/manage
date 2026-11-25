import mongoose, { Schema, Document } from 'mongoose';

export interface IStockCountItem {
  productId: mongoose.Types.ObjectId;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number;
  reason?: string;
}

export interface IStockCount extends Document {
  countNumber: string;
  warehouseId: mongoose.Types.ObjectId;
  countDate: Date;
  status: 'In Progress' | 'Pending Approval' | 'Approved' | 'Rejected';
  items: IStockCountItem[];
  countedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockCountItemSchema = new Schema<IStockCountItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    systemQuantity: { type: Number, required: true, min: 0 },
    physicalQuantity: { type: Number, required: true, min: 0 },
    difference: { type: Number, required: true },
    reason: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const stockCountSchema = new Schema<IStockCount>(
  {
    countNumber: { type: String, required: true, unique: true, trim: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    countDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['In Progress', 'Pending Approval', 'Approved', 'Rejected'],
      default: 'In Progress',
    },
    items: { type: [stockCountItemSchema], default: [] },
    countedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true, collection: 'stockCounts' }
);

export const StockCount =
  mongoose.models.StockCount ||
  mongoose.model<IStockCount>('StockCount', stockCountSchema);

import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  sku: string;
  barcode: string;
  categoryId: mongoose.Types.ObjectId;
  brand: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  minStockLevel: number;
  imageUrl: string;
  description: string;
  status: 'Active' | 'Inactive';
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    barcode: { type: String, default: '', trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    brand: { type: String, default: '', trim: true },
    unit: { type: String, required: true, trim: true, default: 'Piece' },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    minStockLevel: { type: Number, required: true, min: 0, default: 10 },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true, collection: 'products' }
);

productSchema.index({ name: 'text', sku: 'text', barcode: 'text', brand: 'text' });

export const Product =
  mongoose.models.Product || mongoose.model<IProduct>('Product', productSchema);

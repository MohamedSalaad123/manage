import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  code: string;
  description: string;
  status: 'Active' | 'Inactive';
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true, collection: 'categories' }
);

export const Category =
  mongoose.models.Category || mongoose.model<ICategory>('Category', categorySchema);

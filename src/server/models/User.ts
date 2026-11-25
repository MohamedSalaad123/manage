import mongoose, { Schema, Document } from 'mongoose';
import type { RoleType, PermissionKey } from '../config/permissions';

export interface IUser extends Document {
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  role: RoleType;
  assignedWarehouseId?: mongoose.Types.ObjectId | null;
  employeeId?: mongoose.Types.ObjectId | null;
  accountStatus: 'Active' | 'Suspended' | 'Inactive';
  customPermissions?: Partial<Record<PermissionKey, boolean>>;
  preferredLanguage: 'so' | 'en';
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'ACCOUNTANT'],
      required: true,
    },
    assignedWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    accountStatus: {
      type: String,
      enum: ['Active', 'Suspended', 'Inactive'],
      default: 'Active',
    },
    customPermissions: { type: Schema.Types.Mixed, default: {} },
    preferredLanguage: { type: String, enum: ['so', 'en'], default: 'so' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'users' }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

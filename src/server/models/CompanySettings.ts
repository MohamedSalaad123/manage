import mongoose, { Schema, Document } from 'mongoose';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions';

export interface ICompanySettings extends Document {
  singletonKey: string;
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  currency: string;
  defaultLanguage: 'so' | 'en';
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  notificationSettings: {
    lowStockAlerts: boolean;
    outOfStockAlerts: boolean;
    transferAlerts: boolean;
    stockInOutAlerts: boolean;
  };
  approvalSettings: {
    requireTransferApproval: boolean;
    requireAdjustmentApproval: boolean;
    requireStockCountApproval: boolean;
    allowNegativeStock: boolean;
  };
  rolePermissions: Record<string, string[]>;
  backupConfig: {
    autoBackupEnabled: boolean;
    frequency: 'daily' | 'weekly' | 'manual';
    lastBackupAt?: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const companySettingsSchema = new Schema<ICompanySettings>(
  {
    singletonKey: { type: String, default: 'PRIMARY', unique: true },
    companyName: { type: String, default: 'KHAYRE CONSTRUCTION AND MATERIALS COMPANY' },
    companyLogo: { type: String, default: '/src/assets/images/khayre_logo_1795416086464.jpg' },
    companyAddress: { type: String, default: 'KM4 Industrial Corridor, Mogadishu' },
    companyPhone: { type: String, default: '+252 61 500 0000' },
    companyEmail: { type: String, default: 'operations@khayreconstruction.com' },
    currency: { type: String, default: 'USD' },
    defaultLanguage: { type: String, enum: ['so', 'en'], default: 'so' },
    dateFormat: { type: String, enum: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'], default: 'YYYY-MM-DD' },
    notificationSettings: {
      lowStockAlerts: { type: Boolean, default: true },
      outOfStockAlerts: { type: Boolean, default: true },
      transferAlerts: { type: Boolean, default: true },
      stockInOutAlerts: { type: Boolean, default: true },
    },
    approvalSettings: {
      requireTransferApproval: { type: Boolean, default: true },
      requireAdjustmentApproval: { type: Boolean, default: true },
      requireStockCountApproval: { type: Boolean, default: true },
      allowNegativeStock: { type: Boolean, default: false },
    },
    rolePermissions: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_ROLE_PERMISSIONS }),
    },
    backupConfig: {
      autoBackupEnabled: { type: Boolean, default: true },
      frequency: { type: String, enum: ['daily', 'weekly', 'manual'], default: 'daily' },
      lastBackupAt: { type: Date, default: null },
    },
  },
  { timestamps: true, collection: 'companySettings' }
);

export const CompanySettings =
  mongoose.models.CompanySettings ||
  mongoose.model<ICompanySettings>('CompanySettings', companySettingsSchema);

import mongoose from 'mongoose';
import {
  Category,
  CompanySettings,
  Product,
  Supplier,
  Warehouse,
  StockTransaction,
  Employee,
} from '../models';
import { applyStockIncrease } from './inventoryService';
import { generateDocumentNumber } from './sequenceService';

let ensureSettingsPromise: Promise<void> | null = null;

export async function ensureBaseSettings(): Promise<void> {
  if (ensureSettingsPromise) {
    return ensureSettingsPromise;
  }

  ensureSettingsPromise = (async () => {
    try {
      await CompanySettings.findOneAndUpdate(
        { singletonKey: 'PRIMARY' },
        { $setOnInsert: { singletonKey: 'PRIMARY' } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code !== 11000) {
        throw err;
      }
    } finally {
      ensureSettingsPromise = null;
    }
  })();

  return ensureSettingsPromise;
}

export async function seedStarterOperationalData(adminUserId: mongoose.Types.ObjectId): Promise<void> {
  await ensureBaseSettings();

  const warehouseCount = await Warehouse.countDocuments();
  if (warehouseCount > 0) return;

  const categories = await Category.insertMany([
    { name: 'Cement & Binders', code: 'CAT-CEM', description: 'Portland cement, lime, and structural binders' },
    { name: 'Steel & Rebar', code: 'CAT-STL', description: 'Deformed rebar, structural beams, and mesh' },
    { name: 'Timber & Formwork', code: 'CAT-TMB', description: 'Kiln-dried timber, plywood, and scaffolding boards' },
    { name: 'Plumbing & PVC', code: 'CAT-PVC', description: 'Pressure pipes, drainage fittings, and valves' },
    { name: 'Aggregates & Masonry', code: 'CAT-AGG', description: 'Crushed gravel, sand, and concrete blocks' },
  ]);

  const [whCentral, whPort, whHargeisa] = await Warehouse.insertMany([
    {
      name: 'Mogadishu Central Depot',
      code: 'WH-MGQ-01',
      location: 'Mogadishu',
      address: 'KM4 Industrial Corridor, Wadajir District',
      managerId: adminUserId,
      phone: '+252 61 500 1100',
      description: 'Primary distribution hub for bulk cement, steel, and civil engineering materials.',
      status: 'Active',
      createdBy: adminUserId,
    },
    {
      name: 'Mogadishu Port Terminal Warehouse',
      code: 'WH-MGQ-02',
      location: 'Mogadishu Port',
      address: 'Hammar Weyne Port Access Gate 3',
      managerId: adminUserId,
      phone: '+252 61 500 2200',
      description: 'Import receiving facility for containerized rebar, PVC pipes, and finishing supplies.',
      status: 'Active',
      createdBy: adminUserId,
    },
    {
      name: 'Hargeisa Regional Hub',
      code: 'WH-HGA-01',
      location: 'Hargeisa',
      address: 'Berbera Corridor Industrial Zone',
      managerId: adminUserId,
      phone: '+252 63 400 3300',
      description: 'Northern regional warehouse serving Somaliland construction projects.',
      status: 'Active',
      createdBy: adminUserId,
    },
  ]);

  await Employee.create({
    fullName: 'Khayre Operations Director',
    employeeCode: 'EMP-0001',
    phone: '+252 61 500 0001',
    email: 'operations@khayreconstruction.com',
    position: 'Chief Operations Administrator',
    assignedWarehouseId: whCentral._id,
    userId: adminUserId,
    status: 'Active',
  });

  const [supCement, supSteel] = await Supplier.insertMany([
    {
      supplierName: 'Horn Industrial Cement Trading',
      companyName: 'Horn Industrial Materials LLC',
      contactPerson: 'Abdirahman Farah',
      phone: '+252 61 522 8890',
      email: 'supply@hornindustrial.com',
      address: 'Port Road Zone B, Mogadishu',
      notes: 'Primary bulk Portland cement importer',
    },
    {
      supplierName: 'East Africa Steel Rolling Mills',
      companyName: 'EA Steel & Alloys Ltd',
      contactPerson: 'Hassan Mohamed',
      phone: '+254 720 441 900',
      email: 'orders@easteel.co.ke',
      address: 'Industrial Area, Mombasa / Mogadishu Desk',
      notes: 'Grade 500B deformed steel rebar supplier',
    },
  ]);

  const products = await Product.insertMany([
    {
      name: 'Portland Cement 42.5N (50kg)',
      sku: 'KCM-CEM-001',
      barcode: '6291041500011',
      categoryId: categories[0]._id,
      brand: 'Khayre Supreme',
      unit: 'Bag',
      purchasePrice: 8.5,
      sellingPrice: 10.75,
      minStockLevel: 150,
      imageUrl: '/src/assets/images/material_cement_1795416087100.jpg',
      description: 'High-strength 42.5N structural Portland cement in 50kg multi-wall bags.',
      status: 'Active',
    },
    {
      name: 'Deformed Steel Rebar 12mm (12m)',
      sku: 'KCM-STL-012',
      barcode: '6291041500028',
      categoryId: categories[1]._id,
      brand: 'HornSteel B500',
      unit: 'Piece',
      purchasePrice: 9.2,
      sellingPrice: 12.0,
      minStockLevel: 200,
      imageUrl: '/src/assets/images/material_rebar_1795416086928.jpg',
      description: '12mm ribbed high-tensile reinforcement bar, 12 meter standard length.',
      status: 'Active',
    },
    {
      name: 'Deformed Steel Rebar 16mm (12m)',
      sku: 'KCM-STL-016',
      barcode: '6291041500035',
      categoryId: categories[1]._id,
      brand: 'HornSteel B500',
      unit: 'Piece',
      purchasePrice: 16.4,
      sellingPrice: 20.5,
      minStockLevel: 100,
      imageUrl: '/src/assets/images/material_rebar_1795416086928.jpg',
      description: '16mm heavy structural reinforcement bar for columns and foundations.',
      status: 'Active',
    },
    {
      name: 'Kiln-Dried Structural Timber 2x4 (4m)',
      sku: 'KCM-TMB-024',
      barcode: '6291041500042',
      categoryId: categories[2]._id,
      brand: 'NordicPine Formwork',
      unit: 'Piece',
      purchasePrice: 7.8,
      sellingPrice: 10.5,
      minStockLevel: 80,
      imageUrl: '/src/assets/images/material_timber_1795416087559.jpg',
      description: 'Kiln-dried framing and formwork timber planks.',
      status: 'Active',
    },
    {
      name: 'uPVC Drainage Pipe 110mm (6m)',
      sku: 'KCM-PVC-110',
      barcode: '6291041500059',
      categoryId: categories[3]._id,
      brand: 'DuraFlow',
      unit: 'Piece',
      purchasePrice: 14.0,
      sellingPrice: 18.5,
      minStockLevel: 60,
      imageUrl: '',
      description: 'Heavy-duty 110mm uPVC underground drainage pipe.',
      status: 'Active',
    },
    {
      name: 'Washed Crushed Aggregate 20mm',
      sku: 'KCM-AGG-020',
      barcode: '6291041500066',
      categoryId: categories[4]._id,
      brand: 'Khayre Quarry',
      unit: 'Kilogram',
      purchasePrice: 0.04,
      sellingPrice: 0.06,
      minStockLevel: 5000,
      imageUrl: '',
      description: 'Graded 20mm basalt crushed stone for structural concrete mixing.',
      status: 'Active',
    },
  ]);

  const initialAllocations = [
    { warehouse: whCentral, product: products[0], qty: 500, supplier: supCement, cost: 8.5 },
    { warehouse: whPort, product: products[0], qty: 300, supplier: supCement, cost: 8.4 },
    { warehouse: whHargeisa, product: products[0], qty: 200, supplier: supCement, cost: 8.75 },
    { warehouse: whCentral, product: products[1], qty: 650, supplier: supSteel, cost: 9.2 },
    { warehouse: whPort, product: products[1], qty: 420, supplier: supSteel, cost: 9.1 },
    { warehouse: whCentral, product: products[2], qty: 180, supplier: supSteel, cost: 16.4 },
    { warehouse: whHargeisa, product: products[2], qty: 65, supplier: supSteel, cost: 16.8 },
    { warehouse: whCentral, product: products[3], qty: 240, supplier: supCement, cost: 7.8 },
    { warehouse: whPort, product: products[4], qty: 45, supplier: supSteel, cost: 14.0 },
    { warehouse: whCentral, product: products[5], qty: 18000, supplier: supCement, cost: 0.04 },
  ];

  for (const item of initialAllocations) {
    const res = await applyStockIncrease({
      warehouseId: item.warehouse._id,
      productId: item.product._id,
      quantity: item.qty,
      unitCost: item.cost,
      session: null,
    });

    await StockTransaction.create({
      transactionNumber: generateDocumentNumber('SIN'),
      direction: 'IN',
      movementType: 'Opening Balance',
      status: 'Confirmed',
      ledgerPosted: true,
      warehouseId: item.warehouse._id,
      productId: item.product._id,
      quantity: item.qty,
      unit: item.product.unit,
      unitCost: item.cost,
      totalAmount: Number((item.qty * item.cost).toFixed(2)),
      previousQuantity: res.previousQty,
      quantityIn: item.qty,
      quantityOut: 0,
      newQuantity: res.newQty,
      supplierId: item.supplier._id,
      invoiceNumber: 'INIT-OPENING-2026',
      referenceNumber: 'OPENING-BALANCE',
      notes: 'Initial warehouse opening balance',
      transactionDate: new Date(),
      performedBy: adminUserId,
      confirmedBy: adminUserId,
      confirmedAt: new Date(),
    });
  }
}

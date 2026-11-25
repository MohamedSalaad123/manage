# KHAYRE CONSTRUCTION AND MATERIALS COMPANY — Enterprise WMS

A full-stack, multi-warehouse **Warehouse Management System (WMS)** built with React, Vite, Tailwind CSS, Node.js, Express, and MongoDB/Mongoose.

## Core Capabilities

- **Unlimited Dynamic Warehouses**: Create, activate/deactivate, assign managers & employees, and inspect per-warehouse inventory, valuation, and transactions.
- **Centralized Product Catalog**: Unique SKUs, barcodes, categories, custom units of measurement, minimum stock levels, and global multi-warehouse stock breakdown.
- **Moving Weighted Average Costing**: Automatic inventory valuation updated on confirmed Stock In receipts and inter-warehouse transfers.
- **Stock In, Stock Out & Permanent Stock Ledger**: Drafts, confirmations, printable vouchers, negative-stock prevention, and immutable ledger history.
- **Inter-Warehouse Transfers**: Request, approve/reject, reserve stock, dispatch, and confirm full or partial receipts (including damaged and missing quantities) using atomic MongoDB transactions.
- **Physical Stock Counts & Adjustments**: Variance tracking, approval-gated reconciliation, and permanent audit logging.
- **Role-Based Access Control (RBAC)**: `SUPER_ADMIN`, `GENERAL_MANAGER`, `WAREHOUSE_MANAGER`, `STOREKEEPER`, and `ACCOUNTANT` with warehouse-scoped enforcement and configurable permission matrix.
- **Bilingual Interface**: Somali (`so`, primary) and English (`en`).
- **12 Enterprise Reports**: Exportable to Excel (`.xlsx`), PDF, and Print.

## Environment Variables

Configure these variables in `.env` (for local) or Render Dashboard (for production):

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/khayre_wms?retryWrites=true&w=majority
JWT_SECRET=<64-char-random-secret>
PORT=3000
CLIENT_URL=https://your-service-name.onrender.com
NODE_ENV=production
```

## Local Development

```bash
npm install
npm run dev
```

When `MONGODB_URI` is not set in local preview, the server automatically runs an in-process MongoDB Replica Set so all schemas, aggregations, and ACID transactions operate normally.

## Production Deployment on Render

1. Provision a **MongoDB Atlas** cluster (M0 or higher) and copy the connection string into `MONGODB_URI`.
2. Create a new **Web Service** on Render connected to this repository:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Add environment variables `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, and `NODE_ENV=production`.
4. Verify health at `GET /api/health`.
5. On first launch, complete the **Initial Super Admin Setup** screen to claim the first administrator account.

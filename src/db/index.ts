/**
 * TallyTracker — Database Initialization
 *
 * Sets up WatermelonDB with SQLite adapter.
 * Registers all model classes and applies migrations.
 */

import { Database } from '@nozbe/watermelondb';
import { createAdapter } from './adapter';

// Model classes
import CaUser from './models/CaUser';
import Entity from './models/Entity';
import AccountGroup from './models/AccountGroup';
import Ledger from './models/Ledger';
import Voucher from './models/Voucher';
import VoucherLine from './models/VoucherLine';
import GstComponent from './models/GstComponent';
import Habit from './models/Habit';
import Party from './models/Party';
import AuditLog from './models/AuditLog';
import StockItem from './models/StockItem';

// ─── Adapter Setup ─────────────────────────────────────────────
const adapter = createAdapter();

// ─── Database Instance ─────────────────────────────────────────
const database = new Database({
  adapter,
  modelClasses: [
    CaUser,
    Entity,
    AccountGroup,
    Ledger,
    Voucher,
    VoucherLine,
    GstComponent,
    Habit,
    Party,
    AuditLog,
    StockItem,
  ],
});

export default database;

// Re-export models for convenience
export {
  CaUser,
  Entity,
  AccountGroup,
  Ledger,
  Voucher,
  VoucherLine,
  GstComponent,
  Habit,
  Party,
  AuditLog,
  StockItem,
};

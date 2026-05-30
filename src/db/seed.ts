/**
 * TallyTracker — Seed Data
 *
 * Seeds the full Tally account group tree on entity creation.
 * Supports subgroups via parentGroupId relationships.
 * All entries are marked is_system = true.
 */

import { Database } from '@nozbe/watermelondb';
import { TABLE_NAMES } from '../utils/constants';
import type { AccountNature } from '../utils/constants';

// ─── Group Definitions ─────────────────────────────────────────
interface GroupDef {
  name: string;
  nature: AccountNature;
  parentName?: string;
  displayOrder: number;
  ledgers: LedgerDef[];
}

interface LedgerDef {
  name: string;
  gstRate?: number;
  affectsStock?: boolean;
  openingDrCr?: 'Dr' | 'Cr';
}

const SEED_GROUPS: GroupDef[] = [
  // --- 1. Capital Account and subgroups ---
  {
    name: 'Capital Account',
    nature: 'equity',
    displayOrder: 1,
    ledgers: [
      { name: 'Capital A/c' },
      { name: 'Drawings A/c' },
    ],
  },
  {
    name: 'Reserves & Surplus',
    nature: 'equity',
    parentName: 'Capital Account',
    displayOrder: 2,
    ledgers: [
      { name: 'Reserves & Surplus' },
    ],
  },
  {
    name: 'Retained Earnings',
    nature: 'equity',
    parentName: 'Capital Account',
    displayOrder: 3,
    ledgers: [],
  },

  // --- 2. Loans (Liability) and subgroups ---
  {
    name: 'Loans (Liability)',
    nature: 'liability',
    displayOrder: 4,
    ledgers: [
      { name: 'Unsecured Loans' },
      { name: 'Loans from Directors' },
    ],
  },
  {
    name: 'Bank OCC A/c',
    nature: 'liability',
    parentName: 'Loans (Liability)',
    displayOrder: 5,
    ledgers: [],
  },
  {
    name: 'Bank OD A/c',
    nature: 'liability',
    parentName: 'Loans (Liability)',
    displayOrder: 6,
    ledgers: [
      { name: 'Bank OD A/c' },
    ],
  },
  {
    name: 'Secured Loans',
    nature: 'liability',
    parentName: 'Loans (Liability)',
    displayOrder: 7,
    ledgers: [
      { name: 'Secured Loans' },
    ],
  },

  // --- 3. Current Liabilities and subgroups ---
  {
    name: 'Current Liabilities',
    nature: 'liability',
    displayOrder: 8,
    ledgers: [],
  },
  {
    name: 'Duties & Taxes',
    nature: 'liability',
    parentName: 'Current Liabilities',
    displayOrder: 9,
    ledgers: [
      { name: 'Duties & Taxes' },
    ],
  },
  {
    name: 'Provisions',
    nature: 'liability',
    parentName: 'Current Liabilities',
    displayOrder: 10,
    ledgers: [
      { name: 'Provisions' },
    ],
  },
  {
    name: 'Sundry Creditors',
    nature: 'liability',
    parentName: 'Current Liabilities',
    displayOrder: 11,
    ledgers: [
      { name: 'Sundry Creditors' },
    ],
  },

  // --- 4. Fixed Assets ---
  {
    name: 'Fixed Assets',
    nature: 'asset',
    displayOrder: 12,
    ledgers: [
      { name: 'Land & Building' },
      { name: 'Plant & Machinery' },
      { name: 'Furniture & Fixtures' },
      { name: 'Vehicles' },
      { name: 'Computer Equipment' },
    ],
  },

  // --- 5. Investments ---
  {
    name: 'Investments',
    nature: 'asset',
    displayOrder: 13,
    ledgers: [],
  },

  // --- 6. Current Assets and subgroups ---
  {
    name: 'Current Assets',
    nature: 'asset',
    displayOrder: 14,
    ledgers: [],
  },
  {
    name: 'Stock-in-Hand',
    nature: 'asset',
    parentName: 'Current Assets',
    displayOrder: 15,
    ledgers: [
      { name: 'Stock-in-Hand', affectsStock: true },
    ],
  },
  {
    name: 'Deposits (Asset)',
    nature: 'asset',
    parentName: 'Current Assets',
    displayOrder: 16,
    ledgers: [],
  },
  {
    name: 'Loans & Advances (Asset)',
    nature: 'asset',
    parentName: 'Current Assets',
    displayOrder: 17,
    ledgers: [
      { name: 'Loans & Advances (Asset)' },
    ],
  },
  {
    name: 'Sundry Debtors',
    nature: 'asset',
    parentName: 'Current Assets',
    displayOrder: 18,
    ledgers: [
      { name: 'Sundry Debtors' },
    ],
  },
  {
    name: 'Cash-in-Hand',
    nature: 'asset',
    parentName: 'Current Assets',
    displayOrder: 19,
    ledgers: [
      { name: 'Cash-in-Hand' },
    ],
  },
  {
    name: 'Bank Accounts',
    nature: 'asset',
    parentName: 'Current Assets',
    displayOrder: 20,
    ledgers: [
      { name: 'Bank Accounts' },
    ],
  },

  // --- 7. Branch / Divisions ---
  {
    name: 'Branch / Divisions',
    nature: 'equity',
    displayOrder: 21,
    ledgers: [],
  },

  // --- 8. Misc. Expenses (ASSET) ---
  {
    name: 'Misc. Expenses (ASSET)',
    nature: 'asset',
    displayOrder: 22,
    ledgers: [],
  },

  // --- 9. Suspense A/c ---
  {
    name: 'Suspense A/c',
    nature: 'liability',
    displayOrder: 23,
    ledgers: [],
  },

  // --- 10. Sales Accounts ---
  {
    name: 'Sales Accounts',
    nature: 'income',
    displayOrder: 24,
    ledgers: [
      { name: 'Sales A/c', gstRate: 18, affectsStock: true },
      { name: 'Sales Return A/c', gstRate: 18 },
    ],
  },

  // --- 11. Purchase Accounts ---
  {
    name: 'Purchase Accounts',
    nature: 'expense',
    displayOrder: 25,
    ledgers: [
      { name: 'Purchase A/c', gstRate: 18, affectsStock: true },
      { name: 'Purchase Return A/c', gstRate: 18 },
    ],
  },

  // --- 12. Direct Incomes and synonyms/subgroups ---
  {
    name: 'Direct Incomes',
    nature: 'income',
    displayOrder: 26,
    ledgers: [
      { name: 'Service Revenue', gstRate: 18 },
      { name: 'Consulting Fees', gstRate: 18 },
      { name: 'Contract Revenue', gstRate: 18 },
    ],
  },
  {
    name: 'Income From Dues',
    nature: 'income',
    parentName: 'Direct Incomes',
    displayOrder: 27,
    ledgers: [],
  },

  // --- 13. Indirect Incomes and subgroups ---
  {
    name: 'Indirect Incomes',
    nature: 'income',
    displayOrder: 28,
    ledgers: [
      { name: 'Interest Received' },
      { name: 'Rent Received', gstRate: 18 },
      { name: 'Commission Received', gstRate: 18 },
      { name: 'Dividend Received' },
      { name: 'Miscellaneous Income' },
    ],
  },

  // --- 14. Direct Expenses and subgroups ---
  {
    name: 'Direct Expenses',
    nature: 'expense',
    displayOrder: 29,
    ledgers: [
      { name: 'Raw Material Consumed', gstRate: 18 },
      { name: 'Direct Wages' },
      { name: 'Freight Inward', gstRate: 18 },
      { name: 'Packing Material', gstRate: 18 },
    ],
  },

  // --- 15. Indirect Expenses and subgroups ---
  {
    name: 'Indirect Expenses',
    nature: 'expense',
    displayOrder: 30,
    ledgers: [
      { name: 'Salary' },
      { name: 'Rent Paid', gstRate: 18 },
      { name: 'Electricity' },
      { name: 'Telephone', gstRate: 18 },
      { name: 'Advertising', gstRate: 18 },
      { name: 'Depreciation' },
      { name: 'Professional Fees', gstRate: 18 },
      { name: 'Miscellaneous Expenses' },
      { name: 'Round Off A/c' },
    ],
  },
];

// ─── Seed Function ─────────────────────────────────────────────

/**
 * Seed the full Tally account group tree for a new entity.
 * Creates standard groups and their sub-groups recursively.
 *
 * @param database - WatermelonDB instance
 * @param entityId - The ID of the newly created entity
 */
export async function seedAccountTree(database: Database, entityId: string): Promise<void> {
  await database.write(async () => {
    const groupsCollection = database.get(TABLE_NAMES.ACCOUNT_GROUPS);
    const ledgersCollection = database.get(TABLE_NAMES.LEDGERS);

    const batchOps: any[] = [];
    const groupMap = new Map<string, any>();

    // 1. First prepare all group creations and resolve parent inline (safe and synchronous)
    for (const groupDef of SEED_GROUPS) {
      const group = groupsCollection.prepareCreate((record: any) => {
        record.entityId = entityId;
        record.name = groupDef.name;
        record.nature = groupDef.nature;
        record.parentGroupId = groupDef.parentName ? (groupMap.get(groupDef.parentName)?.id ?? null) : null;
        record.isSystem = true;
        record.displayOrder = groupDef.displayOrder;
      });
      groupMap.set(groupDef.name, group);
      batchOps.push(group);
    }

    // 2. Create ledgers under their resolved groups
    for (const groupDef of SEED_GROUPS) {
      const group = groupMap.get(groupDef.name);
      if (!group) continue;

      for (const ledgerDef of groupDef.ledgers) {
        const ledger = ledgersCollection.prepareCreate((record: any) => {
          record.entityId = entityId;
          record.groupId = group.id; // Use the group's generated ID
          record.name = ledgerDef.name;
          record.gstRate = ledgerDef.gstRate ?? 0;
          record.hsnSac = '';
          record.affectsStock = ledgerDef.affectsStock ?? false;
          record.isSystem = true;
          record.openingBalanceDrCr = ledgerDef.openingDrCr ?? 'Dr';
          record.openingBalancePaise = 0;
          record.isArchived = false;
        });

        batchOps.push(ledger);
      }
    }

    await database.batch(...batchOps);
  });
}

/**
 * Seeds default compliance habits for a newly onboarded CA.
 *
 * @param database - WatermelonDB instance
 * @param caUserId - The ID of the newly created CA User profile
 */
export async function seedDefaultHabits(database: Database, caUserId: string): Promise<void> {
  const DEFAULT_HABITS = [
    { title: 'Check bank statement & cash matches', frequency: 'daily' },
    { title: 'Record sales & purchase vouchers', frequency: 'daily' },
    { title: 'Reconcile Sundry Creditors & Debtors', frequency: 'weekly' },
    { title: 'Review outstanding GST liabilities', frequency: 'weekly' },
    { title: 'Prepare & file GSTR-1 return', frequency: 'monthly' },
    { title: 'Prepare & file GSTR-3B return', frequency: 'monthly' },
    { title: 'TDS / TCS liability payment', frequency: 'monthly' },
    { title: 'Compute & pay Advance Tax', frequency: 'quarterly' },
    { title: 'File TDS / TCS quarterly returns', frequency: 'quarterly' },
    { title: 'Prepare Balance Sheet & P&L statements', frequency: 'annual' },
    { title: 'File GSTR-9 & GSTR-9C returns', frequency: 'annual' },
    { title: 'File Income Tax Return (ITR)', frequency: 'annual' },
  ];

  await database.write(async () => {
    const habitsCollection = database.get(TABLE_NAMES.HABITS);
    const batchOps = DEFAULT_HABITS.map((habit) =>
      habitsCollection.prepareCreate((record: any) => {
        record.caUserId = caUserId;
        record.title = habit.title;
        record.frequency = habit.frequency;
        record.lastCompletedDate = null;
        record.streakCount = 0;
      })
    );
    await database.batch(...batchOps);
  });
}

const reconciliationPromises = new Map<string, Promise<void>>();

/**
 * Compares and updates the ledger groups for an existing entity.
 * Creates any groups from SEED_GROUPS that are not present.
 * Ensures the parent-child relationships are correct.
 * Concurrency-safe and includes self-healing cleanup for duplicate groups.
 *
 * @param database - WatermelonDB instance
 * @param entityId - The ID of the active entity to reconcile
 */
export async function reconcileEntityGroups(database: Database, entityId: string): Promise<void> {
  let promise = reconciliationPromises.get(entityId);
  if (!promise) {
    promise = performReconciliation(database, entityId).finally(() => {
      reconciliationPromises.delete(entityId);
    });
    reconciliationPromises.set(entityId, promise);
  }
  return promise;
}

async function performReconciliation(database: Database, entityId: string): Promise<void> {
  const groupsCollection = database.get(TABLE_NAMES.ACCOUNT_GROUPS);
  
  // 1. Fetch all existing groups for this entity
  let existingGroups = await groupsCollection.query().fetch();
  let entityGroups = existingGroups.filter((g: any) => g.entityId === entityId) as any[];
  
  // A. Self-healing: Check for duplicate groups by name and merge them
  const seenNames = new Map<string, any>();
  const duplicateGroupIds = new Set<string>();
  const duplicateToKeptMap = new Map<string, string>();
  
  for (const group of entityGroups) {
    const existing = seenNames.get(group.name);
    if (existing) {
      duplicateGroupIds.add(group.id);
      duplicateToKeptMap.set(group.id, existing.id);
    } else {
      seenNames.set(group.name, group);
    }
  }
  
  if (duplicateGroupIds.size > 0) {
    const ledgersCollection = database.get(TABLE_NAMES.LEDGERS);
    const allLedgers = await ledgersCollection.query().fetch();
    const entityLedgers = allLedgers.filter((l: any) => l.entityId === entityId) as any[];
    
    // Find ledgers pointing to duplicate groups that will be deleted
    const ledgersToUpdate = entityLedgers.filter((l: any) => duplicateGroupIds.has(l.groupId));
    
    await database.write(async () => {
      const cleanupOps: any[] = [];
      
      // Update ledgers to point to the kept group ID
      for (const ledger of ledgersToUpdate) {
        const keptGroupId = duplicateToKeptMap.get(ledger.groupId);
        if (keptGroupId) {
          const preparedUpdate = ledger.prepareUpdate((record: any) => {
            record.groupId = keptGroupId;
          });
          cleanupOps.push(preparedUpdate);
        }
      }
      
      // Delete the duplicate groups
      for (const groupId of duplicateGroupIds) {
        const groupToDelete = entityGroups.find((g: any) => g.id === groupId);
        if (groupToDelete) {
          cleanupOps.push(groupToDelete.prepareDestroyPermanently());
        }
      }
      
      if (cleanupOps.length > 0) {
        await database.batch(...cleanupOps);
      }
    });
    
    // Refresh group lists after deletion
    existingGroups = await groupsCollection.query().fetch();
    entityGroups = existingGroups.filter((g: any) => g.entityId === entityId) as any[];
  }

  // A2. Self-healing singular to plural synonym cleanup:
  // e.g. Point any ledger belonging to 'Direct Income' to 'Direct Incomes', then delete 'Direct Income'.
  const singularToPluralNames = new Map<string, string>([
    ['Direct Income', 'Direct Incomes'],
    ['Indirect Income', 'Indirect Incomes'],
    ['Direct Expense', 'Direct Expenses'],
    ['Indirect Expense', 'Indirect Expenses'],
    ['Income (Direct)', 'Direct Incomes'],
    ['Income (Indirect)', 'Indirect Incomes'],
    ['Expenses (Direct)', 'Direct Expenses'],
    ['Expenses (Indirect)', 'Indirect Expenses'],
  ]);

  const synonymGroupIdsToDelete = new Set<string>();
  const synonymToPluralMap = new Map<string, string>();

  // Find existing kept plural groups first
  const pluralGroupMap = new Map<string, any>();
  for (const group of entityGroups) {
    if (Array.from(singularToPluralNames.values()).includes(group.name)) {
      pluralGroupMap.set(group.name, group);
    }
  }

  for (const group of entityGroups) {
    const pluralName = singularToPluralNames.get(group.name);
    if (pluralName) {
      // Find the kept plural equivalent group
      const keptPluralGroup = pluralGroupMap.get(pluralName);
      if (keptPluralGroup) {
        synonymGroupIdsToDelete.add(group.id);
        synonymToPluralMap.set(group.id, keptPluralGroup.id);
      }
    }
  }

  if (synonymGroupIdsToDelete.size > 0) {
    const ledgersCollection = database.get(TABLE_NAMES.LEDGERS);
    const allLedgers = await ledgersCollection.query().fetch();
    const entityLedgers = allLedgers.filter((l: any) => l.entityId === entityId) as any[];
    
    // Find ledgers pointing to singular synonym groups that will be deleted
    const ledgersToUpdate = entityLedgers.filter((l: any) => synonymGroupIdsToDelete.has(l.groupId));
    
    await database.write(async () => {
      const cleanupOps: any[] = [];
      
      // Update ledgers to point to the kept plural group ID
      for (const ledger of ledgersToUpdate) {
        const keptGroupId = synonymToPluralMap.get(ledger.groupId);
        if (keptGroupId) {
          const preparedUpdate = ledger.prepareUpdate((record: any) => {
            record.groupId = keptGroupId;
          });
          cleanupOps.push(preparedUpdate);
        }
      }
      
      // Delete the singular synonym groups
      for (const groupId of synonymGroupIdsToDelete) {
        const groupToDelete = entityGroups.find((g: any) => g.id === groupId);
        if (groupToDelete) {
          cleanupOps.push(groupToDelete.prepareDestroyPermanently());
        }
      }
      
      if (cleanupOps.length > 0) {
        await database.batch(...cleanupOps);
      }
    });
    
    // Refresh group list after cleanup
    existingGroups = await groupsCollection.query().fetch();
    entityGroups = existingGroups.filter((g: any) => g.entityId === entityId) as any[];
  }
  
  const groupByName = new Map<string, any>(entityGroups.map((g: any) => [g.name, g]));
  
  const batchOps: any[] = [];
  const newGroupMap = new Map<string, any>();
  const groupsToCreate: GroupDef[] = [];
  
  // 2. Identify which groups from SEED_GROUPS are missing
  for (const groupDef of SEED_GROUPS) {
    if (!groupByName.has(groupDef.name)) {
      groupsToCreate.push(groupDef);
    }
  }
  
  // Pre-prepare create for all missing groups and resolve parents inline (safe & synchronized)
  for (const groupDef of SEED_GROUPS) {
    if (!groupByName.has(groupDef.name)) {
      const group = groupsCollection.prepareCreate((record: any) => {
        record.entityId = entityId;
        record.name = groupDef.name;
        record.nature = groupDef.nature;
        record.parentGroupId = groupDef.parentName 
          ? (groupByName.get(groupDef.parentName)?.id || newGroupMap.get(groupDef.parentName)?.id || null) 
          : null;
        record.isSystem = true;
        record.displayOrder = groupDef.displayOrder;
      });
      newGroupMap.set(groupDef.name, group);
      batchOps.push(group);
    }
  }
  
  // Identify existing groups that need their nature or parentGroupId updated
  const updatesToPrepare: { record: any; nature: AccountNature; parentGroupId: string | null }[] = [];
  for (const groupDef of SEED_GROUPS) {
    const existingGroup = groupByName.get(groupDef.name);
    if (existingGroup) {
      let needsUpdate = false;
      const expectedParent = groupDef.parentName 
        ? (groupByName.get(groupDef.parentName) || newGroupMap.get(groupDef.parentName))
        : null;
      
      const expectedParentId = expectedParent ? expectedParent.id : null;
      
      if (existingGroup.nature !== groupDef.nature || existingGroup.parentGroupId !== expectedParentId) {
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        updatesToPrepare.push({
          record: existingGroup,
          nature: groupDef.nature,
          parentGroupId: expectedParentId,
        });
      }
    }
  }
  
  if (batchOps.length === 0 && updatesToPrepare.length === 0) {
    return;
  }
  
  await database.write(async () => {
    // Prepare updates for existing groups that need them
    for (const update of updatesToPrepare) {
      const preparedUpdate = update.record.prepareUpdate((record: any) => {
        record.nature = update.nature;
        record.parentGroupId = update.parentGroupId;
      });
      batchOps.push(preparedUpdate);
    }
    
    await database.batch(...batchOps);
  });
}

/**
 * Get the count of groups and ledgers that would be seeded.
 * Useful for verification.
 */
export function getSeedCounts(): { groups: number; ledgers: number } {
  const groups = SEED_GROUPS.length;
  const ledgers = SEED_GROUPS.reduce((sum, g) => sum + g.ledgers.length, 0);
  return { groups, ledgers };
}

export { SEED_GROUPS };


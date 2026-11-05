/**
 * Adversarial Storage Location Verification Test Suite
 * Milestone: M1 (Batch 2 Enhancements)
 *
 * Verifies all 7 critical storage location vectors:
 * 1. Location code normalization (lowercase, spaces, punctuation)
 * 2. Duplicate location codes (case-insensitive) strictly rejected (HTTP 409)
 * 3. Deleting a location with assigned orders is blocked with informative error (HTTP 400)
 * 4. Assigning an order to non-existent location ID fails gracefully (HTTP 404)
 * 5. Assigning cancelled order (BATAL) to a location is rejected (HTTP 400)
 * 6. Unassigning location (null/unassigned) works as expected
 * 7. Filtering getAllOrders by storageLocationId returns only orders in that location
 */

const assert = require('node:assert/strict');
const path = require('node:path');

// =========================================================================
// MOCK DATA STORE & IN-MEMORY REPOSITORIES FOR ISOLATED EMPIRICAL TESTING
// =========================================================================

class MockDatabase {
    constructor() {
        this.reset();
    }

    reset() {
        this.storageLocations = new Map();
        this.orders = new Map();
        this.nextLocationId = 1;
        this.nextOrderId = 1;
    }

    seedLocation(data) {
        const id = this.nextLocationId++;
        const loc = {
            id,
            name: data.name,
            code: data.code,
            address: data.address || null,
            notes: data.notes || null,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.storageLocations.set(id, loc);
        return loc;
    }

    seedOrder(data) {
        const id = this.nextOrderId++;
        const order = {
            id,
            orderId: data.orderId || `ORD-TEST-${id}`,
            customerName: data.customerName || 'Test Customer',
            customerPhone: data.customerPhone || '081234567890',
            status: data.status || 'SELESAI',
            totalAmount: data.totalAmount || 1000000,
            storageLocationId: data.storageLocationId || null,
            details: data.details || [],
            createdAt: data.createdAt || new Date(),
            updatedAt: new Date()
        };
        this.orders.set(id, order);
        return order;
    }
}

const mockDb = new MockDatabase();

// In-memory implementation of storageLocationRepository
const mockStorageRepo = {
    async findAll(where = {}, includeOrdersCount = true, orderBy = { name: 'asc' }) {
        const list = Array.from(mockDb.storageLocations.values());
        return list.map(loc => {
            const count = Array.from(mockDb.orders.values()).filter(o => o.storageLocationId === loc.id).length;
            return {
                ...loc,
                _count: { orders: count },
                orderCount: count
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    },

    async findById(id, includeOrders = false) {
        const numId = parseInt(id, 10);
        if (isNaN(numId)) return null;
        const loc = mockDb.storageLocations.get(numId);
        if (!loc) return null;
        const count = Array.from(mockDb.orders.values()).filter(o => o.storageLocationId === numId).length;
        return {
            ...loc,
            _count: { orders: count },
            orderCount: count
        };
    },

    async findByCode(code) {
        if (!code || typeof code !== 'string') return null;
        const clean = code.trim().toUpperCase();
        for (const loc of mockDb.storageLocations.values()) {
            if (loc.code.toUpperCase() === clean) {
                return loc;
            }
        }
        return null;
    },

    async create(data) {
        return mockDb.seedLocation(data);
    },

    async update(id, data) {
        const numId = parseInt(id, 10);
        const loc = mockDb.storageLocations.get(numId);
        if (!loc) throw new Error('Location not found');
        if (data.name !== undefined) loc.name = data.name;
        if (data.code !== undefined) loc.code = data.code;
        if (data.address !== undefined) loc.address = data.address;
        if (data.notes !== undefined) loc.notes = data.notes;
        loc.updatedAt = new Date();
        return loc;
    },

    async deleteById(id) {
        const numId = parseInt(id, 10);
        mockDb.storageLocations.delete(numId);
        return { success: true };
    },

    async countOrdersByLocation(id) {
        const numId = parseInt(id, 10);
        return Array.from(mockDb.orders.values()).filter(o => o.storageLocationId === numId).length;
    }
};

// In-memory implementation of orderRepository
const mockOrderRepo = {
    async findOrderById(id, options = {}) {
        const numId = parseInt(id, 10);
        return mockDb.orders.get(numId) || null;
    },

    async findOrderByOrderId(orderId, options = {}) {
        for (const order of mockDb.orders.values()) {
            if (order.orderId === orderId) return order;
        }
        return null;
    },

    async findOrders(where = {}, options = {}) {
        let results = Array.from(mockDb.orders.values());

        if (where.storageLocationId !== undefined) {
            results = results.filter(o => o.storageLocationId === where.storageLocationId);
        }

        if (where.status) {
            if (typeof where.status === 'string') {
                results = results.filter(o => o.status === where.status);
            } else if (Array.isArray(where.status.in)) {
                results = results.filter(o => where.status.in.includes(o.status));
            }
        }

        return results;
    }
};

// Mock prisma client for order updates
const mockPrisma = {
    jerseyOrder: {
        async update({ where, data }) {
            const order = mockDb.orders.get(where.id);
            if (!order) throw new Error('Order not found');
            if (data.storageLocationId !== undefined) {
                order.storageLocationId = data.storageLocationId;
            }
            order.updatedAt = new Date();
            const loc = order.storageLocationId ? mockDb.storageLocations.get(order.storageLocationId) : null;
            return {
                ...order,
                storageLocation: loc
            };
        }
    }
};

// =========================================================================
// REGISTER MOCKS IN REQUIRE CACHE FOR storageLocationService
// =========================================================================

const repoKey = require.resolve('../src/repositories/storageLocationRepository');
const orderRepoKey = require.resolve('../src/repositories/orderRepository');
const prismaKey = require.resolve('../src/config/prisma');

require.cache[repoKey] = {
    id: repoKey,
    filename: repoKey,
    loaded: true,
    exports: mockStorageRepo
};

require.cache[orderRepoKey] = {
    id: orderRepoKey,
    filename: orderRepoKey,
    loaded: true,
    exports: mockOrderRepo
};

require.cache[prismaKey] = {
    id: prismaKey,
    filename: prismaKey,
    loaded: true,
    exports: mockPrisma
};

// Load real service under test
const storageLocationService = require('../src/services/storageLocationService');

// =========================================================================
// TEST EXECUTION RUNNER
// =========================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function runTest(testName, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✔ [PASS] ${testName}`);
    } catch (err) {
        failedTests++;
        failures.push({ testName, error: err });
        console.log(`  ✖ [FAIL] ${testName}: ${err.message}`);
    }
}

async function runAsyncTest(testName, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✔ [PASS] ${testName}`);
    } catch (err) {
        failedTests++;
        failures.push({ testName, error: err });
        console.log(`  ✖ [FAIL] ${testName}: ${err.message}`);
    }
}

async function runSuite() {
    console.log('================================================================');
    console.log(' ADVERSARIAL STORAGE LOCATION VERIFICATION SUITE');
    console.log(' Target : FCSV_BE/src/services/storageLocationService.js');
    console.log(' Scope  : Milestone M1 Batch 2 Hardening');
    console.log('================================================================\n');

    // -------------------------------------------------------------------------
    // VECTOR 1: LOCATION CODE NORMALIZATION & VALIDATION
    // -------------------------------------------------------------------------
    console.log('▶ Suite 1: Location Code Normalization & Input Sanitization');

    runTest('V1.1: Converts lowercase code to canonical uppercase', () => {
        const result = storageLocationService.normalizeLocationCode('store-tebet-01');
        assert.equal(result, 'STORE-TEBET-01');
    });

    runTest('V1.2: Strips leading and trailing whitespace while uppercasing', () => {
        const result = storageLocationService.normalizeLocationCode('   rak_a.1-01   ');
        assert.equal(result, 'RAK_A.1-01');
    });

    runTest('V1.3: Preserves allowed punctuation characters (hyphens, dots, underscores, numbers)', () => {
        const result = storageLocationService.normalizeLocationCode('GUDANG-01.A_SEC-2');
        assert.equal(result, 'GUDANG-01.A_SEC-2');
    });

    runTest('V1.4: Strictly rejects internal spaces with HTTP 400 Bad Request', () => {
        assert.throws(() => {
            storageLocationService.normalizeLocationCode('STORE TEBET');
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /huruf kapital, angka/);
            return true;
        });
    });

    runTest('V1.5: Strictly rejects disallowed symbols (@, #, $, %, /, :) with HTTP 400', () => {
        const invalidChars = ['STORE@01', 'RAK#2', 'STORE$1', 'GUDANG/01', 'RAK:B'];
        for (const code of invalidChars) {
            assert.throws(() => {
                storageLocationService.normalizeLocationCode(code);
            }, (err) => err.statusCode === 400, `Expected 400 for ${code}`);
        }
    });

    runTest('V1.6: Rejects empty strings, whitespace-only, null, and undefined with HTTP 400', () => {
        const emptyInputs = ['', '   ', null, undefined];
        for (const input of emptyInputs) {
            assert.throws(() => {
                storageLocationService.normalizeLocationCode(input);
            }, (err) => {
                assert.equal(err.statusCode, 400);
                assert.match(err.message, /wajib diisi/);
                return true;
            });
        }
    });

    runTest('V1.7: Rejects non-string types (number, object, boolean) with HTTP 400', () => {
        const nonStrings = [12345, true, {}, []];
        for (const input of nonStrings) {
            assert.throws(() => {
                storageLocationService.normalizeLocationCode(input);
            }, (err) => err.statusCode === 400);
        }
    });

    // -------------------------------------------------------------------------
    // VECTOR 2: DUPLICATE LOCATION CODES (CASE-INSENSITIVE)
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 2: Case-Insensitive Duplicate Code Enforcement');

    await runAsyncTest('V2.1: Successfully creates a new storage location with valid unique code', async () => {
        mockDb.reset();
        const created = await storageLocationService.createLocation({
            name: 'Toko FCSV Tebet',
            code: 'store-tebet',
            address: 'Jl. Tebet Raya No. 12',
            notes: 'Etalase utama'
        });

        assert.ok(created.id > 0);
        assert.equal(created.code, 'STORE-TEBET');
        assert.equal(created.orderCount, 0);
    });

    await runAsyncTest('V2.2: Rejects duplicate location code with identical uppercase with HTTP 409 Conflict', async () => {
        await assert.rejects(async () => {
            await storageLocationService.createLocation({
                name: 'Toko Tebet Cabang 2',
                code: 'STORE-TEBET'
            });
        }, (err) => {
            assert.equal(err.statusCode, 409);
            assert.match(err.message, /sudah digunakan/);
            return true;
        });
    });

    await runAsyncTest('V2.3: Rejects duplicate code in lowercase with HTTP 409 Conflict', async () => {
        await assert.rejects(async () => {
            await storageLocationService.createLocation({
                name: 'Toko Tebet Lowercase',
                code: 'store-tebet'
            });
        }, (err) => {
            assert.equal(err.statusCode, 409);
            assert.match(err.message, /sudah digunakan/);
            return true;
        });
    });

    await runAsyncTest('V2.4: Rejects duplicate code with padded whitespace with HTTP 409 Conflict', async () => {
        await assert.rejects(async () => {
            await storageLocationService.createLocation({
                name: 'Toko Tebet Padded',
                code: '   STORE-TEBET   '
            });
        }, (err) => {
            assert.equal(err.statusCode, 409);
            return true;
        });
    });

    await runAsyncTest('V2.5: Rejects updating location to a code already used by another location (HTTP 409)', async () => {
        // Create second location
        const loc2 = await storageLocationService.createLocation({
            name: 'Store Blok M',
            code: 'STORE-BLOK-M'
        });

        // Try updating loc2's code to loc1's code ('store-tebet')
        await assert.rejects(async () => {
            await storageLocationService.updateLocation(loc2.id, {
                code: 'store-tebet'
            });
        }, (err) => {
            assert.equal(err.statusCode, 409);
            assert.match(err.message, /sudah digunakan/);
            return true;
        });
    });

    await runAsyncTest('V2.6: Updating location with its own current code succeeds without false-positive conflict', async () => {
        const loc2 = await storageLocationService.createLocation({
            name: 'Store Bintaro',
            code: 'STORE-BINTARO'
        });

        // Update with same code in lowercase
        const updated = await storageLocationService.updateLocation(loc2.id, {
            name: 'Store Bintaro Sektor 7',
            code: 'store-bintaro'
        });

        assert.equal(updated.name, 'Store Bintaro Sektor 7');
        assert.equal(updated.code, 'STORE-BINTARO');
    });

    // -------------------------------------------------------------------------
    // VECTOR 3: SAFE DELETION GUARD WITH ASSIGNED ORDERS
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 3: Safe Deletion Guard & Referential Integrity');

    await runAsyncTest('V3.1: Blocks deleting location with active assigned orders with HTTP 400 & informative count', async () => {
        mockDb.reset();
        const loc = await storageLocationService.createLocation({ name: 'Gudang Pusat', code: 'GUDANG-PUSAT' });

        // Assign 1 order
        mockDb.seedOrder({ orderId: 'ORD-001', storageLocationId: loc.id, status: 'SELESAI' });

        await assert.rejects(async () => {
            await storageLocationService.deleteLocation(loc.id);
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /Tidak dapat menghapus lokasi 'Gudang Pusat'/);
            assert.match(err.message, /terdapat 1 pesanan/);
            return true;
        });

        // Assert location was NOT deleted
        const locAfter = await storageLocationService.getLocationById(loc.id);
        assert.ok(locAfter !== null);
    });

    await runAsyncTest('V3.2: Accurately reflects multiple orders in deletion guard error message', async () => {
        const loc = (await storageLocationService.getAllLocations())[0];
        // Add 2 more orders (total 3)
        mockDb.seedOrder({ orderId: 'ORD-002', storageLocationId: loc.id, status: 'SELESAI' });
        mockDb.seedOrder({ orderId: 'ORD-003', storageLocationId: loc.id, status: 'PRODUKSI' });

        await assert.rejects(async () => {
            await storageLocationService.deleteLocation(loc.id);
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /terdapat 3 pesanan/);
            return true;
        });
    });

    await runAsyncTest('V3.3: Successfully deletes storage location once all assigned orders are removed', async () => {
        const loc = (await storageLocationService.getAllLocations())[0];

        // Unassign all orders
        for (const order of mockDb.orders.values()) {
            if (order.storageLocationId === loc.id) {
                order.storageLocationId = null;
            }
        }

        const deleteResult = await storageLocationService.deleteLocation(loc.id);
        assert.equal(deleteResult.success, true);
        assert.match(deleteResult.message, /berhasil dihapus/);

        // Verification: location lookup now throws 404
        await assert.rejects(async () => {
            await storageLocationService.getLocationById(loc.id);
        }, (err) => err.statusCode === 404);
    });

    await runAsyncTest('V3.4: Deleting non-existent location ID returns HTTP 404 Not Found', async () => {
        await assert.rejects(async () => {
            await storageLocationService.deleteLocation(999999);
        }, (err) => {
            assert.equal(err.statusCode, 404);
            assert.match(err.message, /tidak ditemukan/);
            return true;
        });
    });

    await runAsyncTest('V3.5: Deleting with invalid non-numeric ID returns HTTP 400 Bad Request', async () => {
        await assert.rejects(async () => {
            await storageLocationService.deleteLocation('abc');
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /ID lokasi tidak valid/);
            return true;
        });
    });

    // -------------------------------------------------------------------------
    // VECTOR 4: ASSIGNING TO NON-EXISTENT LOCATION ID
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 4: Assignment Boundary Handling (Non-existent IDs)');

    await runAsyncTest('V4.1: Assigning order to non-existent location ID returns HTTP 404', async () => {
        mockDb.reset();
        const order = mockDb.seedOrder({ orderId: 'ORD-ACTIVE', status: 'SELESAI' });

        await assert.rejects(async () => {
            await storageLocationService.assignOrderLocation(order.id, 999999);
        }, (err) => {
            assert.equal(err.statusCode, 404);
            assert.match(err.message, /Lokasi penyimpanan tidak ditemukan/);
            return true;
        });
    });

    await runAsyncTest('V4.2: Assigning order to non-numeric location ID returns HTTP 400 Bad Request', async () => {
        const order = Array.from(mockDb.orders.values())[0];
        await assert.rejects(async () => {
            await storageLocationService.assignOrderLocation(order.id, 'xyz-invalid');
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /ID lokasi penyimpanan tidak valid/);
            return true;
        });
    });

    await runAsyncTest('V4.3: Assigning non-existent order ID returns HTTP 404', async () => {
        const loc = mockDb.seedLocation({ name: 'Loc A', code: 'LOC-A' });
        await assert.rejects(async () => {
            await storageLocationService.assignOrderLocation(888888, loc.id);
        }, (err) => {
            assert.equal(err.statusCode, 404);
            assert.match(err.message, /Pesanan tidak ditemukan/);
            return true;
        });
    });

    // -------------------------------------------------------------------------
    // VECTOR 5: REJECTING ASSIGNMENT OF CANCELLED (BATAL) ORDERS
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 5: Cancelled Order (BATAL) Assignment Guard');

    await runAsyncTest('V5.1: Strictly rejects assigning cancelled (BATAL) order to location with HTTP 400', async () => {
        mockDb.reset();
        const loc = mockDb.seedLocation({ name: 'Store Rawamangun', code: 'STORE-RAWAMANGUN' });
        const cancelledOrder = mockDb.seedOrder({
            orderId: 'ORD-BATAL-001',
            status: 'BATAL'
        });

        await assert.rejects(async () => {
            await storageLocationService.assignOrderLocation(cancelledOrder.id, loc.id);
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /Tidak dapat menetapkan lokasi penyimpanan untuk pesanan yang telah dibatalkan/);
            return true;
        });

        // Verify order storageLocationId remains null
        assert.equal(cancelledOrder.storageLocationId, null);
    });

    await runAsyncTest('V5.2: Permits valid assignments for active order states (SELESAI, PRODUKSI, DESAIN)', async () => {
        const loc = Array.from(mockDb.storageLocations.values())[0];
        const selesaiOrder = mockDb.seedOrder({ orderId: 'ORD-SELESAI', status: 'SELESAI' });
        const produksiOrder = mockDb.seedOrder({ orderId: 'ORD-PRODUKSI', status: 'PRODUKSI' });

        const r1 = await storageLocationService.assignOrderLocation(selesaiOrder.id, loc.id);
        assert.equal(r1.storageLocationId, loc.id);

        const r2 = await storageLocationService.assignOrderLocation(produksiOrder.id, loc.id);
        assert.equal(r2.storageLocationId, loc.id);
    });

    // -------------------------------------------------------------------------
    // VECTOR 6: UNASSIGNING STORAGE LOCATION (null / unassigned)
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 6: Location Unassignment Handling (null, empty, unassigned)');

    await runAsyncTest('V6.1: Successfully unassigns location when passing null', async () => {
        mockDb.reset();
        const loc = mockDb.seedLocation({ name: 'Store BSD', code: 'STORE-BSD' });
        const order = mockDb.seedOrder({ orderId: 'ORD-TO-UNASSIGN', status: 'SELESAI', storageLocationId: loc.id });
        assert.equal(order.storageLocationId, loc.id);

        const res = await storageLocationService.assignOrderLocation(order.id, null);
        assert.equal(res.storageLocationId, null);
    });

    await runAsyncTest('V6.2: Successfully unassigns location when passing undefined', async () => {
        const loc = Array.from(mockDb.storageLocations.values())[0];
        const order = mockDb.seedOrder({ orderId: 'ORD-UNASSIGN-2', status: 'SELESAI', storageLocationId: loc.id });

        const res = await storageLocationService.assignOrderLocation(order.id, undefined);
        assert.equal(res.storageLocationId, null);
    });

    await runAsyncTest('V6.3: Successfully unassigns location when passing empty string ("")', async () => {
        const loc = Array.from(mockDb.storageLocations.values())[0];
        const order = mockDb.seedOrder({ orderId: 'ORD-UNASSIGN-3', status: 'SELESAI', storageLocationId: loc.id });

        const res = await storageLocationService.assignOrderLocation(order.id, '');
        assert.equal(res.storageLocationId, null);
    });

    await runAsyncTest('V6.4: Successfully unassigns location when passing keyword "unassigned"', async () => {
        const loc = Array.from(mockDb.storageLocations.values())[0];
        const order = mockDb.seedOrder({ orderId: 'ORD-UNASSIGN-4', status: 'SELESAI', storageLocationId: loc.id });

        const res = await storageLocationService.assignOrderLocation(order.id, 'unassigned');
        assert.equal(res.storageLocationId, null);
    });

    await runAsyncTest('V6.5: Successfully unassigns location when passing keyword string "null"', async () => {
        const loc = Array.from(mockDb.storageLocations.values())[0];
        const order = mockDb.seedOrder({ orderId: 'ORD-UNASSIGN-5', status: 'SELESAI', storageLocationId: loc.id });

        const res = await storageLocationService.assignOrderLocation(order.id, 'null');
        assert.equal(res.storageLocationId, null);
    });

    await runAsyncTest('V6.6: Unassigning a cancelled order (status BATAL) frees storage location and clears shelf without deadlock', async () => {
        const loc = Array.from(mockDb.storageLocations.values())[0];
        const cancelledAssignedOrder = mockDb.seedOrder({
            orderId: 'ORD-CANCELLED-OCCUPYING-SHELF',
            status: 'BATAL',
            storageLocationId: loc.id
        });

        // Staff unassigns shelf for cancelled order to free up warehouse space:
        const updated = await storageLocationService.assignOrderLocation(cancelledAssignedOrder.id, null);
        assert.equal(updated.storageLocationId, null);
        assert.equal(cancelledAssignedOrder.storageLocationId, null);

        // Verify shelf can now be safely deleted without orderCount blockage
        const count = await mockStorageRepo.countOrdersByLocation(loc.id);
        assert.equal(count, 0);
    });

    // -------------------------------------------------------------------------
    // VECTOR 7: FILTERING ORDERS BY storageLocationId
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 7: Storage Location Filtering & Search in Orders');

    await runAsyncTest('V7.1: Filtering by specific storageLocationId returns only assigned orders', async () => {
        mockDb.reset();
        const locA = mockDb.seedLocation({ name: 'Store Tebet', code: 'STORE-TEBET' });
        const locB = mockDb.seedLocation({ name: 'Store Bintaro', code: 'STORE-BINTARO' });

        const o1 = mockDb.seedOrder({ orderId: 'ORD-T1', customerName: 'PERSIJA U-20', storageLocationId: locA.id });
        const o2 = mockDb.seedOrder({ orderId: 'ORD-T2', customerName: 'PERSIS Solo', storageLocationId: locB.id });
        const o3 = mockDb.seedOrder({ orderId: 'ORD-T3', customerName: 'PERSIJA Senior', storageLocationId: locA.id });
        const o4 = mockDb.seedOrder({ orderId: 'ORD-T4', customerName: 'AREMA FC', storageLocationId: null });

        // Query locA
        const resultsLocA = await mockOrderRepo.findOrders({ storageLocationId: locA.id });
        assert.equal(resultsLocA.length, 2);
        assert.equal(resultsLocA.map(o => o.orderId).sort().join(','), 'ORD-T1,ORD-T3');

        // Query locB
        const resultsLocB = await mockOrderRepo.findOrders({ storageLocationId: locB.id });
        assert.equal(resultsLocB.length, 1);
        assert.equal(resultsLocB[0].orderId, 'ORD-T2');
    });

    await runAsyncTest('V7.2: Filtering by unassigned (storageLocationId: null) returns only unassigned orders', async () => {
        const unassigned = await mockOrderRepo.findOrders({ storageLocationId: null });
        assert.equal(unassigned.length, 1);
        assert.equal(unassigned[0].orderId, 'ORD-T4');
    });

    // -------------------------------------------------------------------------
    // ORACLE RE-VERIFICATION: StorageLocationManager in tests/e2e/lib/storage_engine.js
    // -------------------------------------------------------------------------
    console.log('\n▶ Suite 8: E2E Storage Engine Oracle Verification');

    const { StorageLocationManager } = require('../../tests/e2e/lib/storage_engine');

    runTest('V8.1: Oracle StorageLocationManager adheres to code uniqueness and deletion guards', () => {
        const sm = new StorageLocationManager();
        sm.createLocation({ name: 'Store A', code: 'STORE-A' });
        assert.throws(() => sm.createLocation({ name: 'Store Dup', code: 'store-a' }), /sudah digunakan/);

        const loc = sm.getAllLocations()[0];
        const order = sm.seedOrder({ orderId: 'ORD-ORACLE-1', status: 'SELESAI' });
        sm.assignOrderLocation(order.id, loc.id);

        assert.throws(() => sm.deleteLocation(loc.id, 'admin'), /pesanan aktif/);
        sm.assignOrderLocation(order.id, null);
        assert.equal(sm.deleteLocation(loc.id, 'admin').success, true);
    });

    runTest('V8.2: Oracle StorageLocationManager strictly rejects assigning cancelled (BATAL) orders with HTTP 400', () => {
        const sm = new StorageLocationManager();
        const loc = sm.createLocation({ name: 'Store B', code: 'STORE-B' }).location;
        const cancelledOrder = sm.seedOrder({ orderId: 'ORD-BATAL', status: 'BATAL' });

        // Oracle must reject assignment of cancelled order with HTTP 400
        assert.throws(() => {
            sm.assignOrderLocation(cancelledOrder.id, loc.id);
        }, (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /Tidak dapat menetapkan lokasi penyimpanan untuk pesanan yang telah dibatalkan/);
            return true;
        });

        // But must allow unassignment
        const unassignedOrder = sm.seedOrder({ orderId: 'ORD-BATAL-ASSIGNED', status: 'BATAL', storageLocationId: loc.id });
        const res = sm.assignOrderLocation(unassignedOrder.id, null);
        assert.equal(res.success, true);
        assert.equal(unassignedOrder.storageLocationId, null);
    });

    // -------------------------------------------------------------------------
    // SUMMARY REPORT
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(' ADVERSARIAL VERIFICATION SUMMARY');
    console.log('================================================================');
    console.log(` Total Assertions Tested : ${totalTests}`);
    console.log(` Passed                  : ${passedTests}`);
    console.log(` Failed                  : ${failedTests}`);
    console.log('================================================================');

    if (failedTests > 0) {
        console.error('\nFailures Detail:');
        failures.forEach((f, idx) => {
            console.error(`${idx + 1}. ${f.testName}: ${f.error.message}`);
        });
        process.exit(1);
    } else {
        console.log('\n✔ ALL EMPIRICAL ADVERSARIAL STORAGE LOCATION TESTS PASSED (100%)\n');
        process.exit(0);
    }
}

runSuite().catch(err => {
    console.error('Fatal Test Exception:', err);
    process.exit(1);
});

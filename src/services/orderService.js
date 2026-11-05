/**
 * FCSV Apparel Fullstack Workspace — Order Service Facade
 *
 * This file serves as a 100% backward-compatible export facade for the modularized
 * Order domain sub-services located under `FCSV_BE/src/services/order/`:
 *
 * - orderCoreService: CRUD, status transitions, search, location routing
 * - orderPricingService: Authoritative dynamic pricing engine & size surcharges (3XL+)
 * - orderPaymentService: Payment updates, multi-stage down payments (DP 1, 2, 3+), ledger
 * - orderDesignService: Mockup uploads, client approvals, revisions, cancellations
 * - orderLayoutService: Layout proof uploads, approvals, print & finishing uploads
 * - orderDamageService: Production fabric damage reporting, scrap ratios, stock adjustments
 * - orderDetailService: Jersey player lines CRUD, checklist status toggling (statusBaju, statusCelana)
 * - orderAlternativeService: Fabric alternatives recommendation, selection, video notes
 */

const orderServices = require('./order');

module.exports = orderServices;

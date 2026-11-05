const {
    assertOrderOwnerOrStaff,
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getOrdersByCustomer,
    getOrdersByDesigner,
    trackOrder,
    updateOrder,
    assignOrderStorageLocation
} = require('./orderCoreService');

const {
    calculateAuthoritativeOrderTotal
} = require('./orderPricingService');

const {
    updatePayment,
    addPaymentInstallment,
    getPaymentInstallments
} = require('./orderPaymentService');

const {
    uploadMockup,
    approveDesign,
    unapproveDesign,
    revisiDesign,
    cancelMockup
} = require('./orderDesignService');

const {
    uploadLayout,
    approveLayout,
    unapproveLayout,
    revisiLayout,
    cancelLayout,
    uploadPrint,
    uploadFinishing
} = require('./orderLayoutService');

const {
    recordDamage,
    updateDamage,
    getDamageHistory
} = require('./orderDamageService');

const {
    updateDetailStatus,
    updateOrderDetail,
    addOrderDetail,
    deleteOrderDetail
} = require('./orderDetailService');

const {
    recommendAlternatives,
    selectAlternative,
    updateVideoNotes
} = require('./orderAlternativeService');

module.exports = {
    // Core Order Lifecycle & RBAC
    assertOrderOwnerOrStaff,
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getOrdersByCustomer,
    getOrdersByDesigner,
    trackOrder,
    updateOrder,
    assignOrderStorageLocation,

    // Pricing Engine
    calculateAuthoritativeOrderTotal,

    // Payments & Ledger
    updatePayment,
    addPaymentInstallment,
    getPaymentInstallments,

    // Design Mockup Workflow
    uploadMockup,
    approveDesign,
    unapproveDesign,
    revisiDesign,
    cancelMockup,

    // Layout Proof & Production Uploads
    uploadLayout,
    approveLayout,
    unapproveLayout,
    revisiLayout,
    cancelLayout,
    uploadPrint,
    uploadFinishing,

    // Fabric Alternatives & Production Notes
    recommendAlternatives,
    selectAlternative,
    updateVideoNotes,

    // Fabric Damage & Inventory Stock Tracking
    recordDamage,
    updateDamage,
    getDamageHistory,

    // Jersey Player Detail Items & Checklist
    updateDetailStatus,
    updateOrderDetail,
    addOrderDetail,
    deleteOrderDetail
};

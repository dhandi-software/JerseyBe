const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const order = await prisma.jerseyOrder.findFirst({
        where: { orderId: 'dbf458df-8bc1-4272-89cb-1f898c5aff4d' }
    });
    
    if (order) {
        console.log('Order found:');
        console.log('ID:', order.id);
        console.log('OrderID:', order.orderId);
        console.log('DesignUrl:', order.designUrl);
        console.log('PaymentUrl:', order.paymentUrl);
    } else {
        console.log('Order not found');
    }
    process.exit(0);
}

main();

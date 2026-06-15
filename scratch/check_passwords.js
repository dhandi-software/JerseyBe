const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    const commonPasswords = ['password', 'password123', 'admin', 'admin123', '123456', 'desain', 'manager', 'gudang'];
    for (const user of users) {
        for (const pass of commonPasswords) {
            if (await bcrypt.compare(pass, user.password)) {
                console.log(`User: ${user.username} (${user.role}) -> Password: "${pass}"`);
                break;
            }
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

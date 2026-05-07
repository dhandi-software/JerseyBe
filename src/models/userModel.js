const prisma = require('../prisma');
const bcrypt = require('bcrypt');

const findUserByIdentifier = async (identifier) => {
    return await prisma.user.findFirst({
        where: {
            OR: [
                { username: identifier },
                { email: identifier }
            ]
        },
        include: {
            customer: true,
            staff: true
        }
    });
};

const createUser = async (userData) => {
    const { username, password, email, role, name, ...otherDetails } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);

    return await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
            email,
            role,
            ...(role.toLowerCase() === 'customer' && {
                customer: {
                    create: {
                        nama: name,
                    }
                }
            }),
            ...(['desain', 'manager', 'gudang', 'admin'].includes(role.toLowerCase()) && {
                staff: {
                    create: {
                        nama: name,
                    }
                }
            }),
        }
    });
};

module.exports = {
    findUserByIdentifier,
    createUser
};

const userRepository = require('../repositories/userRepository');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const findUserByIdentifier = async (identifier) => {
    return await userRepository.findUserByIdentifier(identifier);
};

const createUser = async (userData) => {
    const { username, password, email, role, name } = userData;
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
                        nama: name
                    }
                }
            }),
            ...(['desain', 'manager', 'gudang', 'admin'].includes(role.toLowerCase()) && {
                staff: {
                    create: {
                        nama: name
                    }
                }
            })
        }
    });
};

module.exports = {
    findUserByIdentifier,
    createUser
};

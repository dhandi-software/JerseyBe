const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const getProfile = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: {
                customer: true,
                staff: true,
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Determine name
        const name = user.customer?.nama || user.staff?.nama || user.username;

        res.status(200).json({
            code: 200,
            status: "success",
            message: "Profile retrieved successfully",
            data: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                name: name,
                photo: user.photo,
                bio: user.bio,
                customer: user.customer,
                staff: user.staff,
            }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, bio } = req.body;
        
        let photoUrl = undefined;
        
        if (req.file) {
            photoUrl = req.file.filename;
        } else if (req.body.photo === '') {
            photoUrl = null;
        }

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: { customer: true, staff: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updateData = {};
        if (bio !== undefined) updateData.bio = bio;
        if (photoUrl !== undefined) updateData.photo = photoUrl;

        await prisma.$transaction(async (tx) => {
            // Update User table
            if (Object.keys(updateData).length > 0) {
                await tx.user.update({
                    where: { id: parseInt(id) },
                    data: updateData
                });
            }

            // Update Name in respective table
            if (name) {
                if (user.customer) {
                    await tx.customer.update({
                        where: { id: user.customer.id },
                        data: { nama: name }
                    });
                } else if (user.staff) {
                    await tx.staff.update({
                        where: { id: user.staff.id },
                        data: { nama: name }
                    });
                }
            }
        });

        res.status(200).json({
            code: 200,
            status: "success",
            message: "Profile updated successfully"
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getProfile,
    updateProfile
};

const userService = require('../services/userService');
const reportService = require('../services/reportService');

const createCustomer = async (req, res) => {
    try {
        const { email, password, nama } = req.body;
        const result = await userService.createCustomer({ email, password, nama });

        res.status(201).json({ message: 'Customer account created successfully', data: result });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        console.error('Error creating customer:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const createTeamInternal = async (req, res) => {
    try {
        const { email, password, nama, role } = req.body;
        const creatorRole = req.user?.role?.toLowerCase();

        const result = await userService.createTeamInternal({
            email,
            password,
            nama,
            role,
            creatorRole
        });

        res.status(201).json({ message: 'Internal staff account created successfully', data: result });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error creating internal team:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getUserCountByRole = async (req, res) => {
    try {
        const { role } = req.query;
        const result = await userService.getUserCountByRole(role);
        res.json(result);
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getUsersByRole = async (req, res) => {
    try {
        const { role } = req.query;
        const users = await userService.getUsersByRole(role);
        res.json({ data: users });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const userData = await userService.getUserById(id);
        res.json({ data: userData });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({ message: error.message });
        }
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await userService.updateUser(id, req.body);
        res.json(result);
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({ message: error.message });
        }
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.status(200).json({
            code: 200,
            status: 'success',
            data: users
        });
    } catch (error) {
        console.error('Error fetching all users:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await userService.deleteUser(id);
        res.json(result);
    } catch (error) {
        console.error('Error deleting user:', error.message);
        if (error.statusCode === 404 || error.message === 'User not found') {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const deleteUsersBatch = async (req, res) => {
    try {
        const { ids } = req.body;
        const result = await userService.deleteUsersBatch(ids);
        res.json(result);
    } catch (error) {
        console.error('Error deleting users batch:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Internal Server Error' });
    }
};

const getDesigners = async (req, res) => {
    try {
        const designers = await userService.getDesigners();
        res.json({ data: designers });
    } catch (error) {
        console.error('Error fetching designers:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getAllChatCustomers = async (req, res) => {
    try {
        const chatters = await userService.getAllChatCustomers();
        res.json({ data: chatters });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const { year, month } = req.query;
        const stats = await reportService.getDashboardStats({ year, month });

        res.json({
            code: 200,
            status: 'success',
            message: 'Dashboard stats fetched successfully',
            data: stats
        });
    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getOmsetReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const report = await reportService.getOmsetReport({ startDate, endDate });

        res.status(200).json({
            status: 'success',
            data: report
        });
    } catch (error) {
        console.error('Error getOmsetReport:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    createCustomer,
    createTeamInternal,
    getUserCountByRole,
    getUsersByRole,
    getAllUsers,
    updateUser,
    deleteUser,
    deleteUsersBatch,
    getUserById,
    getDashboardStats,
    getAllChatCustomers,
    getDesigners,
    getOmsetReport
};

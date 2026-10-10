function formatUserName(user) {
    if (!user) return 'Guest User';
    return user.customer?.nama || user.staff?.nama || user.username || 'Guest User';
}

module.exports = {
    formatUserName
};

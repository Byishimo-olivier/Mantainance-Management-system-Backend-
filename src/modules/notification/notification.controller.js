const notificationService = require("./notification.service");

const notificationController = {
    async getUserNotifications(req, res) {
        try {
            const userId = req.user.userId;
            const notifications = await notificationService.getUserNotifications(userId);
            res.json(notifications);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const notification = await notificationService.markAsRead(id);
            res.json(notification);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async markAllAsRead(req, res) {
        try {
            const userId = req.user.userId;
            await notificationService.markAllAsRead(userId);
            res.json({ message: "All notifications marked as read" });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
};

module.exports = notificationController;

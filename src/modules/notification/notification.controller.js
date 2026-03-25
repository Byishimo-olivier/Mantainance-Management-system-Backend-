const notificationService = require("./notification.service");

const withDirectMessageTarget = (link, userId) => {
    const base = String(link || '').trim();
    const targetId = String(userId || '').trim();
    if (!targetId) return base || null;
    const separator = base.includes('?') ? '&' : '?';
    return `${base || ''}${separator}dm=${encodeURIComponent(targetId)}`;
};

const notificationController = {
    async getUserNotifications(req, res) {
        try {
            const userId = req.user.userId;
            const notifications = await notificationService.getUserNotifications(userId, {
                type: req.query.type || null,
                limit: req.query.limit || null
            });
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
    },

    async sendDirectMessage(req, res) {
        try {
            const senderId = req.user?.userId;
            const senderName = req.user?.name || req.user?.email || 'Someone';
            const { recipientUserId, recipientName, message, link, title } = req.body || {};

            if (!senderId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            if (!recipientUserId) {
                return res.status(400).json({ message: 'recipientUserId is required' });
            }
            if (!message || !String(message).trim()) {
                return res.status(400).json({ message: 'message is required' });
            }
            if (String(senderId) === String(recipientUserId)) {
                return res.status(400).json({ message: 'You cannot message yourself' });
            }

            const incomingNotification = await notificationService.createNotification({
                userId: String(recipientUserId),
                title: title || `Private message from ${senderName}`,
                message: String(message).trim(),
                type: 'direct_message',
                link: withDirectMessageTarget(link || null, senderId)
            });

            await notificationService.createNotification({
                userId: String(senderId),
                title: `Private message to ${String(recipientName || recipientUserId).trim()}`,
                message: String(message).trim(),
                type: 'direct_message_sent',
                link: withDirectMessageTarget(link || null, recipientUserId)
            });

            res.status(201).json(incomingNotification);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
};

module.exports = notificationController;

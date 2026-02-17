const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class NotificationService {
    /**
     * Create a new notification for a user
     */
    async createNotification({ userId, title, message, type = "info", link = null }) {
        try {
            if (!userId) return null;

            const notification = await prisma.notification.create({
                data: {
                    userId,
                    title,
                    message,
                    type,
                    link,
                    read: false
                }
            });
            return notification;
        } catch (error) {
            console.error("Error creating notification:", error);
            return null;
        }
    }

    /**
     * Get all notifications for a specific user
     */
    async getUserNotifications(userId) {
        try {
            return await prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 50
            });
        } catch (error) {
            console.error("Error fetching notifications:", error);
            return [];
        }
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId) {
        try {
            return await prisma.notification.update({
                where: { id: notificationId },
                data: { read: true }
            });
        } catch (error) {
            console.error("Error marking notification as read:", error);
            return null;
        }
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId) {
        try {
            return await prisma.notification.updateMany({
                where: { userId, read: false },
                data: { read: true }
            });
        } catch (error) {
            console.error("Error marking all notifications as read:", error);
            return null;
        }
    }

    /**
     * Notify all admins/managers
     */
    async notifyAdmins({ title, message, type = "info", link = null }) {
        try {
            const staff = await prisma.user.findMany({
                where: {
                    role: { in: ['admin', 'manager'] },
                    status: 'active'
                }
            });

            const notifications = await Promise.all(
                staff.map(user => this.createNotification({
                    userId: user.id,
                    title,
                    message,
                    type,
                    link
                }))
            );

            return notifications;
        } catch (error) {
            console.error("Error notifying admins:", error);
            return [];
        }
    }
}

module.exports = new NotificationService();

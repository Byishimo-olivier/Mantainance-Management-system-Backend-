const express = require("express");
const router = express.Router();
const notificationController = require("./notification.controller");
const { authenticate } = require("../../middleware/auth");

router.get("/", authenticate, notificationController.getUserNotifications);
router.patch("/:id/read", authenticate, notificationController.markAsRead);
router.patch("/read-all", authenticate, notificationController.markAllAsRead);

module.exports = router;

const express = require("express");
const router = express.Router();
const aiController = require("./ai.controller");
const { authenticate } = require("../../middleware/auth");

router.post("/generate-checklist", authenticate, aiController.generateChecklist);
router.post("/predict-maintenance/:assetId", aiController.getMaintenancePrediction);
router.post("/triage-issue", aiController.triageIssue);
router.get("/maintenance-summary", authenticate, aiController.getMaintenanceSummary);
router.get("/sentiment-summary", aiController.getSentimentSummary);
router.get("/dashboard-recommendations", authenticate, aiController.getDashboardRecommendations);
router.post("/chat", authenticate, aiController.chat);

module.exports = router;

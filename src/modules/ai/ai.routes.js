const express = require("express");
const router = express.Router();
const aiController = require("./ai.controller");
const { authenticate, optionalAuthenticate } = require("../../middleware/auth");
const { requireFeature } = require("../../middleware/trial");

router.post("/generate-checklist", authenticate, requireFeature("ai_assistance"), aiController.generateChecklist);
router.post("/predict-maintenance/:assetId", authenticate, requireFeature("advanced_ai"), aiController.getMaintenancePrediction);
router.post("/triage-issue", authenticate, requireFeature("ai_assistance"), aiController.triageIssue);
router.get("/maintenance-summary", authenticate, requireFeature("advanced_ai"), aiController.getMaintenanceSummary);
router.get("/sentiment-summary", authenticate, requireFeature("advanced_ai"), aiController.getSentimentSummary);
router.get("/dashboard-recommendations", authenticate, requireFeature("advanced_ai"), aiController.getDashboardRecommendations);
router.post("/chat", optionalAuthenticate, requireFeature("ai_assistance", { allowAnonymous: true }), aiController.chat);

module.exports = router;

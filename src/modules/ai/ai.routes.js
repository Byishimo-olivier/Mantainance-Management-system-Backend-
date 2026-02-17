const express = require("express");
const router = express.Router();
const aiController = require("./ai.controller");

router.post("/predict-maintenance/:assetId", aiController.getMaintenancePrediction);
router.post("/triage-issue", aiController.triageIssue);
router.get("/sentiment-summary", aiController.getSentimentSummary);
router.get("/dashboard-recommendations", aiController.getDashboardRecommendations);
router.post("/chat", aiController.chat);

module.exports = router;

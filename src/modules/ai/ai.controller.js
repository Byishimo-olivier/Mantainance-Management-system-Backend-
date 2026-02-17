const aiService = require("./ai.service");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class AIController {
    /**
     * Predict maintenance for a specific asset
     */
    async getMaintenancePrediction(req, res) {
        try {
            const { assetId } = req.params;
            const asset = await prisma.asset.findUnique({
                where: { id: assetId },
                include: { issues: { take: 10, orderBy: { createdAt: 'desc' } } }
            });

            if (!asset) {
                return res.status(404).json({ message: "Asset not found" });
            }

            const prediction = await aiService.predictMaintenance(asset);
            res.json(prediction);
        } catch (error) {
            console.error("AI Controller Error (Prediction):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Triage a new issue
     */
    async triageIssue(req, res) {
        try {
            const { description } = req.body;
            if (!description) {
                return res.status(400).json({ message: "Description is required" });
            }

            const technicians = await prisma.internalTechnician.findMany({
                where: { status: "Active" }
            });

            const triageResults = await aiService.triageIssue(description, technicians);
            res.json(triageResults);
        } catch (error) {
            console.error("AI Controller Error (Triage):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Get sentiment summary for recent feedback
     */
    async getSentimentSummary(req, res) {
        try {
            let feedback = await prisma.feedback.findMany({
                take: 50,
                orderBy: { date: 'desc' }
            });

            let isFallback = false;
            // Fallback to issues if no feedback exists
            if (feedback.length === 0) {
                const issues = await prisma.issue.findMany({
                    take: 50,
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, description: true, title: true }
                });

                if (issues.length === 0) {
                    return res.json({
                        overallSentiment: "Neutral",
                        summary: "No data available for analysis yet.",
                        urgentFeedbackIds: []
                    });
                }

                feedback = issues.map(i => ({ id: i.id, message: `${i.title}: ${i.description}` }));
                isFallback = true;
            }

            const sentiment = await aiService.analyzeSentiment(feedback.map(f => ({ id: f.id, message: f.message })), isFallback);
            res.json(sentiment);
        } catch (error) {
            console.error("AI Controller Error (Sentiment):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Get dynamic proactive recommendations for the dashboard
     */
    async getDashboardRecommendations(req, res) {
        try {
            const [recentIssues, assets, technicianStats] = await Promise.all([
                prisma.issue.findMany({ take: 20, orderBy: { createdAt: 'desc' } }),
                prisma.asset.findMany({ take: 20 }),
                prisma.internalTechnician.findMany({ where: { status: 'Active' } })
            ]);

            const summary = {
                recentIssues: recentIssues.map(i => ({ title: i.title, status: i.status, location: i.location })),
                assetTypes: [...new Set(assets.map(a => a.type))],
                activeTechnicians: technicianStats.length
            };

            const recommendations = await aiService.getDashboardRecommendations(summary);
            res.json(recommendations);
        } catch (error) {
            console.error("AI Controller Error (Recommendations):", error);
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Chat with the AI
     */
    async chat(req, res) {
        try {
            const { message, history } = req.body;
            if (!message) {
                return res.status(400).json({ message: "Message is required" });
            }

            // Gather deep system context for the AI
            let context = null;
            try {
                const [
                    totalIssues,
                    pendingIssues,
                    completedIssues,
                    activeTechs,
                    properties,
                    recentIssues,
                    assetCount
                ] = await Promise.all([
                    prisma.issue.count(),
                    prisma.issue.count({ where: { status: 'PENDING' } }),
                    prisma.issue.count({ where: { status: 'COMPLETE' } }),
                    prisma.internalTechnician.count({ where: { status: 'Active' } }),
                    prisma.property.findMany({
                        select: { name: true, address: true, type: true },
                        take: 10
                    }),
                    prisma.issue.findMany({
                        take: 5,
                        orderBy: { createdAt: 'desc' },
                        select: { title: true, status: true, location: true }
                    }),
                    prisma.asset.count()
                ]);

                context = {
                    stats: {
                        totalIssues,
                        pendingIssues,
                        completedIssues,
                        activeTechnicians: activeTechs,
                        totalAssets: assetCount,
                        today: new Date().toISOString().split('T')[0]
                    },
                    properties: properties.map(p => `${p.name} (${p.type}) at ${p.address}`),
                    recentIssues: recentIssues.map(i => `${i.title} [Status: ${i.status}] at ${i.location}`)
                };
            } catch (err) {
                console.warn("Failed to gather deep chat context:", err);
            }

            const response = await aiService.chat(message, history, context);
            res.json({ response });
        } catch (error) {
            console.error("AI Controller Error (Chat):", error);
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new AIController();

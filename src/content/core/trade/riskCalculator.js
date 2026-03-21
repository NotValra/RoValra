export const RISK_LEVELS = {
    NO_RISK: 'No Risk',
    LOW: 'Low Risk',
    MEDIUM: 'Medium Risk',
    HIGH: 'High Risk',
    INSANE: 'Insane Risk',
};

export const RISK_COLORS = {
    'No Risk': '#00b06f',
    'Low Risk': '#ffdd15',
    'Medium Risk': '#ff9100',
    'High Risk': '#d43f3a',
    'Insane Risk': '#5a0000',
};

export function calculateRisk(
    priceDataPoints,
    rolimonsData = null,
    volumeDataPoints = null,
) {
    const reasons = [];
    const metrics = {};

    if (!priceDataPoints || priceDataPoints.length < 2) {
        return {
            level: RISK_LEVELS.NO_RISK,
            score: 0,
            reasons: [],
            metrics: {},
        };
    }

    const sortedPoints = priceDataPoints
        .slice()
        .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * oneDayMs;
    let thresholdDate = now - thirtyDaysMs;

    const daysWithSales = new Set();
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
        const t = new Date(sortedPoints[i].date).getTime();
        if (t < thresholdDate) break;
        daysWithSales.add(Math.floor(t / oneDayMs));
    }
    const missedDays = Math.max(0, 30 - daysWithSales.size);
    if (missedDays > 0) {
        thresholdDate = now - (thirtyDaysMs + missedDays * oneDayMs);
    }

    const baselinePoints = [];
    const recentPoints = [];
    let maxRecentPoint = null;

    for (const p of sortedPoints) {
        if (new Date(p.date).getTime() >= thresholdDate) {
            recentPoints.push(p.value);
            if (!maxRecentPoint || p.value > maxRecentPoint.value) {
                maxRecentPoint = p;
            }
        } else {
            baselinePoints.push(p.value);
        }
    }

    if (baselinePoints.length < 5) {
        return {
            level: RISK_LEVELS.NO_RISK,
            score: 0,
            reasons: ['Insufficient historical data for comparison.'],
            metrics: {},
        };
    }

    // We calculate historical stats to know "how much it went up and down in total"
    let historyVol = 0;
    let historyAvg = 0;
    if (baselinePoints.length > 0) {
        const historySum = baselinePoints.reduce((a, b) => a + b, 0);
        historyAvg = historySum / baselinePoints.length;

        const sumSqDiff = baselinePoints.reduce(
            (sum, val) => sum + Math.pow(val - historyAvg, 2),
            0,
        );
        const historyStdDev = Math.sqrt(sumSqDiff / baselinePoints.length);
        historyVol = historyAvg > 0 ? historyStdDev / historyAvg : 0;
    }

    //  Analyze Recent (Last 30 Days)
    if (recentPoints.length === 0) {
        return {
            level: RISK_LEVELS.NO_RISK,
            score: 0,
            reasons: ['No recent sales data (last 30 days).'],
            metrics: { avgVolume: 0 },
        };
    }

    // Calculate "Stable Price" based on the 30-day range
    const stableSum = recentPoints.reduce((a, b) => a + b, 0);
    let stableAvg = stableSum / recentPoints.length;

    // Take best price into consideration when calculating stable price (dont work lol cuz the api doesnt have best price yet)
    if (rolimonsData && rolimonsData.best_price > 0) {
        const bestPrice = rolimonsData.best_price;
        if (bestPrice < stableAvg) {
            stableAvg = (stableAvg + bestPrice) / 2;
        }
    }

    metrics.baselineAvg = stableAvg;

    // Calculate 30-day Volatility
    const stableSqDiff = recentPoints.reduce(
        (sum, val) => sum + Math.pow(val - stableAvg, 2),
        0,
    );
    const stableStdDev = Math.sqrt(stableSqDiff / recentPoints.length);
    metrics.volatility = stableAvg > 0 ? stableStdDev / stableAvg : 0;

    // Compare Current (Last ~3 days) vs Stable (30-day Average)
    // We use the last few points to represent "Current" to detect immediate spikes/drops relative to the 30-day norm
    const latestPoints = recentPoints.slice(-3);
    const currentPrice =
        latestPoints.reduce((a, b) => a + b, 0) / latestPoints.length;

    const diff = currentPrice - stableAvg;
    const percentChange = (diff / stableAvg) * 100;

    // Z-Score: How drastic is this deviation relative to the 30-day volatility?
    // Z = (Current - Stable) / 30d_StdDev
    const zScore = stableStdDev > 0 ? diff / stableStdDev : 0;

    metrics.trendRatio = stableAvg > 0 ? currentPrice / stableAvg : 1;

    let riskScore = 0;

    // Check for Drastic Differences (Spikes / Drops)
    // Threshold: Change > 10% AND it is statistically significant (> 1.0 sigma)
    // We rely on zScore to ensure normal volatility isn't flagged as a spike
    if (percentChange > 10) {
        if (zScore > 1.0) {
            riskScore += 0.4;
            reasons.push(
                `Recent price spike detected (+${percentChange.toFixed(0)}% vs total history).`,
            );
            if (maxRecentPoint) {
                metrics.spikePeak = maxRecentPoint.value;
                metrics.spikeDate = maxRecentPoint.date;
            }
            if (percentChange > 50) riskScore += 0.2;
            if (percentChange > 100) riskScore += 0.2;
        } else {
            // It went up, but this item has a history of high volatility, so it's less "drastic"
            riskScore += 0.2;
            reasons.push(
                `Recent price increase (+${percentChange.toFixed(0)}%) consistent with historical volatility.`,
            );
        }
    } else if (percentChange > 5) {
        riskScore -= 0.15;
        reasons.push(
            `Gradually increasing price (+${percentChange.toFixed(0)}%).`,
        );
    } else if (percentChange < -25) {
        if (zScore < -1.5) {
            // It's a drastic drop
            riskScore += 0.3;
            reasons.push(
                `Recent price drop detected (${percentChange.toFixed(0)}% vs 30-day stable).`,
            );
        } else {
            riskScore += 0.15;
            reasons.push(
                `Gradually decreasing price (${percentChange.toFixed(0)}%).`,
            );
        }
    } else if (percentChange < -1) {
        riskScore += 0.1;
        reasons.push(
            `Gradually decreasing price (${percentChange.toFixed(0)}%).`,
        );
    }

    // Check for Abnormal Volatility (30d Volatility vs History Volatility)
    if (historyVol > 0 && metrics.volatility > historyVol * 2.5) {
        riskScore += 0.15;
        reasons.push(
            `Recent sales are unusually volatile compared to long-term history.`,
        );
    }

    // Basic RAP vs Value Sanity Check
    if (rolimonsData) {
        const rap = rolimonsData.rap || 0;
        const value = rolimonsData.default_price || rap;

        if (rap > 0 && value > 0 && rap < value * 0.85) {
            riskScore += 0.3;
            reasons.push('RAP is significantly lower than Value.');
            metrics.rapValueDrop = (value - rap) / value;
        } else if (metrics.baselineAvg > 0 && rap > metrics.baselineAvg) {
            const rapToStableRatio = rap / metrics.baselineAvg;

            const highThreshold = 1.2 + metrics.volatility * 1.5;

            if (rapToStableRatio > highThreshold) {
                riskScore += 0.2;
                reasons.push(
                    'RAP is unusually high compared to recent stable sales price.',
                );
            } else if (rapToStableRatio > 1.05) {
                riskScore -= 0.15;
                reasons.push(
                    'RAP is higher than stable price (Gradually increasing).',
                );
            }
        }

        if (rolimonsData.best_price > 0 && rap > 0) {
            const bestPrice = rolimonsData.best_price;
            const ratio = bestPrice / rap;

            if (ratio < 0.75) {
                riskScore += 0.3;
                reasons.push('Best Price is significantly lower than RAP.');
            } else if (ratio < 0.95) {
                riskScore += 0.15;
                reasons.push('Best Price is lower than RAP.');
            }
        }
    }

    if (volumeDataPoints && volumeDataPoints.length > 0) {
        const totalVol = volumeDataPoints.reduce((sum, p) => sum + p.value, 0);
        metrics.avgVolume = totalVol / volumeDataPoints.length;

        if (volumeDataPoints.length > 5) {
            const sortedVolume = volumeDataPoints
                .slice()
                .sort(
                    (a, b) =>
                        new Date(a.date).getTime() - new Date(b.date).getTime(),
                );

            const volBaseline = [];
            const volRecent = [];

            for (const p of sortedVolume) {
                if (new Date(p.date).getTime() >= thresholdDate) {
                    volRecent.push(p.value);
                } else {
                    volBaseline.push(p.value);
                }
            }

            if (volBaseline.length > 3 && volRecent.length > 0) {
                const volBaseSum = volBaseline.reduce((a, b) => a + b, 0);
                const volBaseAvg = volBaseSum / volBaseline.length;

                const volRecentSum = volRecent.reduce((a, b) => a + b, 0);
                const volRecentAvg = volRecentSum / volRecent.length;

                const volDiff = volRecentAvg - volBaseAvg;
                const volPercentChange =
                    volBaseAvg > 0 ? (volDiff / volBaseAvg) * 100 : 0;

                const volSumSqDiff = volBaseline.reduce(
                    (sum, val) => sum + Math.pow(val - volBaseAvg, 2),
                    0,
                );
                const volBaseStdDev = Math.sqrt(
                    volSumSqDiff / volBaseline.length,
                );
                const volZScore =
                    volBaseStdDev > 0 ? volDiff / volBaseStdDev : 0;

                metrics.volumeRatio =
                    volBaseAvg > 0 ? volRecentAvg / volBaseAvg : 1;

                // Detect Odd Volume Increase (> 100% and statistically significant)
                if (volPercentChange > 100 && volZScore > 2.0) {
                    riskScore += 0.25;
                    reasons.push(
                        `Suspicious increase in sales volume (+${volPercentChange.toFixed(0)}%).`,
                    );
                }
                // Detect Volume Decrease (Liquidity drying up)
                else if (volPercentChange < -50 && volZScore < -1.0) {
                    riskScore += 0.15;
                    reasons.push(
                        `Significant drop in sales volume (${volPercentChange.toFixed(0)}%).`,
                    );
                }
            }
        }
    }

    if (
        rolimonsData &&
        volumeDataPoints &&
        volumeDataPoints.length > 0 &&
        metrics.avgVolume > 0 &&
        metrics.baselineAvg > 0
    ) {
        const rap = rolimonsData.rap || 0;
        const projectionBaseline =
            historyAvg > 0 ? historyAvg : metrics.baselineAvg;

        // Only run check if RAP is significantly inflated (> 25% above history/stable)
        if (projectionBaseline > 0 && rap > projectionBaseline * 1.25) {
            const volMap = new Map();
            volumeDataPoints.forEach((v) => {
                volMap.set(new Date(v.date).toDateString(), v.value);
            });

            for (const p of sortedPoints) {
                if (new Date(p.date).getTime() >= thresholdDate) {
                    const dateKey = new Date(p.date).toDateString();
                    const vol = volMap.get(dateKey) || 0;

                    // Spike Condition:
                    // 1. Volume > 3x Average
                    // 2. Sale Price > 1.25x Stable Price
                    // 3. Current RAP is roughly maintaining this spike price (> 80% of it)
                    if (
                        vol > metrics.avgVolume * 3 &&
                        vol > 10 &&
                        p.value > projectionBaseline * 1.1
                    ) {
                        riskScore += 0.5;
                        reasons.push('Item is suffering from projection.');
                        break;
                    }
                }
            }
        }
    }

    if (reasons.length === 0 && riskScore === 0) {
        reasons.push('Stable price trend.');
    }

    let level = RISK_LEVELS.NO_RISK;

    if (riskScore >= 0.5) {
        level = RISK_LEVELS.INSANE;
    } else if (riskScore >= 0.35) {
        level = RISK_LEVELS.HIGH;
    } else if (riskScore >= 0.15) {
        level = RISK_LEVELS.MEDIUM;
    } else if (riskScore >= 0.05) {
        level = RISK_LEVELS.LOW;
    }

    const finalScore = Math.max(0, Math.min(riskScore, 1));

    return { level, score: finalScore, reasons, metrics };
}

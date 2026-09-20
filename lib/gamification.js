// lib/gamification.js

export const TIER_THRESHOLDS = [
  { tier: 0, name: 'Fase Inicial', minScore: 0, multiplier: 1.0 },
  { tier: 1, name: 'Discovery Phase', minScore: 500, multiplier: 1.2 },
  { tier: 2, name: 'Emerging Collector', minScore: 2000, multiplier: 1.5 },
  { tier: 3, name: 'Curator Choice', minScore: 5000, multiplier: 2.0 },
  { tier: 4, name: 'Masterpiece Tier', minScore: 10000, multiplier: 3.0 }
]

/**
 * Calcula el Impact Score (IS), el Tier correspondiente y el precio dinámico
 */
export function calculateTierAndPrice(basePriceMxn, likesCount = 0, paidPointsTotal = 0, framedBonusPoints = 0) {
  const impactScore = (likesCount * 1) + (paidPointsTotal * 10) + (framedBonusPoints * 50)

  let currentTier = 0
  let multiplier = 1.0

  if (impactScore >= 10000) {
    currentTier = 4
    multiplier = 3.0
  } else if (impactScore >= 5000) {
    currentTier = 3
    multiplier = 2.0
  } else if (impactScore >= 2000) {
    currentTier = 2
    multiplier = 1.5
  } else if (impactScore >= 500) {
    currentTier = 1
    multiplier = 1.2
  }

  const calculatedPriceMxn = Math.round(basePriceMxn * multiplier)

  return {
    impactScore,
    currentTier,
    multiplier,
    calculatedPriceMxn
  }
}

/**
 * Calcula el progreso relativo entre el Tier actual y el siguiente para la barra visual
 */
export function getTierProgress(impactScore = 0) {
  let currentTierObj = TIER_THRESHOLDS[0]
  let nextTierObj = TIER_THRESHOLDS[1]

  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (impactScore >= TIER_THRESHOLDS[i].minScore) {
      currentTierObj = TIER_THRESHOLDS[i]
      nextTierObj = TIER_THRESHOLDS[i + 1] || null
      break
    }
  }

  if (!nextTierObj) {
    return {
      currentTier: currentTierObj,
      nextTier: null,
      progressPercentage: 100,
      pointsNeeded: 0
    }
  }

  const range = nextTierObj.minScore - currentTierObj.minScore
  const currentProgress = impactScore - currentTierObj.minScore
  const progressPercentage = Math.min(Math.round((currentProgress / range) * 100), 100)
  const pointsNeeded = nextTierObj.minScore - impactScore

  return {
    currentTier: currentTierObj,
    nextTier: nextTierObj,
    progressPercentage,
    pointsNeeded
  }
}
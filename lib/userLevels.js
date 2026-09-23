// lib/userLevels.js

export const USER_LEVELS = [
  { level: 1, name: 'Explorador de Arte', name_en: 'Art Explorer', minXp: 0, maxXp: 499 },
  { level: 2, name: 'Mecenas Bronce', name_en: 'Bronze Patron', minXp: 500, maxXp: 1999 },
  { level: 3, name: 'Curador Emergente', name_en: 'Emerging Curator', minXp: 2000, maxXp: 4999 },
  { level: 4, name: 'Patrono de Colección', name_en: 'Collection Patron', minXp: 5000, maxXp: 9999 },
  { level: 5, name: 'Gran Visión del Estudio', name_en: 'Studio Grand Vision', minXp: 10000, maxXp: Infinity }
]

export function getUserLevelInfo(userXp = 0) {
  let currentLevelObj = USER_LEVELS[0]
  let nextLevelObj = USER_LEVELS[1]

  for (let i = USER_LEVELS.length - 1; i >= 0; i--) {
    if (userXp >= USER_LEVELS[i].minXp) {
      currentLevelObj = USER_LEVELS[i]
      nextLevelObj = USER_LEVELS[i + 1] || null
      break
    }
  }

  if (!nextLevelObj) {
    return {
      currentLevel: currentLevelObj,
      nextLevel: null,
      progressPercentage: 100,
      xpNeeded: 0
    }
  }

  const range = nextLevelObj.minXp - currentLevelObj.minXp
  const currentProgress = userXp - currentLevelObj.minXp
  const progressPercentage = Math.min(Math.round((currentProgress / range) * 100), 100)
  const xpNeeded = nextLevelObj.minXp - userXp

  return {
    currentLevel: currentLevelObj,
    nextLevel: nextLevelObj,
    progressPercentage,
    xpNeeded
  }
}

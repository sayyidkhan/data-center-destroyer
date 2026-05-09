import type { GameState, GameAction } from './types';
import { commandHeroMove, placeTower, deployAttackPackage, upgradeTower, sellTower, startWave } from './engine';

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLACE_TOWER':
      return placeTower(state, action.gridX, action.gridY, action.towerType);
    case 'MOVE_HERO':
      return commandHeroMove(state, action.targetX, action.targetY);
    case 'DEPLOY_ATTACK':
      return deployAttackPackage(state, action.packageId);
    case 'UPGRADE_TOWER':
      return upgradeTower(state, action.towerId);
    case 'SELL_TOWER':
      return sellTower(state, action.towerId);
    case 'START_WAVE':
      return startWave(state);
    case 'SET_SPEED':
      return { ...state, gameSpeed: action.speed };
    case 'CURSOR_MOVE':
      return { ...state, opponentCursor: { x: action.x, y: action.y } };
    default:
      return state;
  }
}

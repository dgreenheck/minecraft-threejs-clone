export function getTextureIndex(blockId) {
  return Object.values(blocks).find(x => x.id === blockId).textureIndex;
}

export const blocks = {
  empty: {
    id: 0,
    name: 'empty',
    visible: false
  },
  grass: {
    id: 1,
    name: 'grass',
    textureIndex: 0
  },
  dirt: {
    id: 2,
    name: 'dirt',
    textureIndex: 2
  },
  stone: {
    id: 3,
    name: 'stone',
    textureIndex: 1,
    scale: { x: 30, y: 30, z: 30 },
    scarcity: 0.8
  },
  coalOre: {
    id: 4,
    name: 'coal_ore',
    textureIndex: 34,
    scale: { x: 20, y: 20, z: 20 },
    scarcity: 0.8
  },
  ironOre: {
    id: 5,
    name: 'iron_ore',
    textureIndex: 33,
    scale: { x: 40, y: 40, z: 40 },
    scarcity: 0.9
  },
  tree: {
    id: 6,
    name: 'tree',
    visible: true,
    textureIndex: 21,
  },
  leaves: {
    id: 7,
    name: 'leaves',
    visible: true,
    textureIndex: 52
  },
  sand: {
    id: 8,
    name: 'sand',
    visible: true,
    textureIndex: 18,
  },
  cloud: {
    id: 9,
    name: 'cloud',
    visible: true,
    textureIndex: 22,
  }
};

export const resources = [
  blocks.stone,
  blocks.coalOre,
  blocks.ironOre
];
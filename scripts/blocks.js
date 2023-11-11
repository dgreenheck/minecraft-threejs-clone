export function getTextureIndex(blockId) {
  return Object.values(blocks).find(x => x.id === blockId).textureIndex;
}

export const TextureOffset = {
  top: 0,
  side: 8,
  bottom: 16
};

const BlockTexture = {
  grass: 0,
  stone: 1,
  dirt: 2,
  grassSide: 3,
  planks: 4,
  sand: 18,
  treeSide: 20,
  treeTop: 21,
  cloud: 22,
  goldOre: 32,
  ironOre: 33,
  coalOre: 34,
  leaves: 53
}

/**
 * Generates a texture index based on the texture offset for each side of the block. If `sides` or `bottom` are not defined, the texture offset for `top` is used instead.
 * @param {TexOffset} top 
 * @param {TexOffset?} sides 
 * @param {TexOffset?} bottom 
 * @returns 
 */
function combineOffsets(top, side = undefined, bottom = undefined) {
  if (!side) {
    side = top;
  }

  if (!bottom) {
    bottom = top
  }

  // Store each texture in one byte of a 32-bit integer
  // Bytes     4       3       2       1
  // Value  UNUSED   SIDES   BOTTOM   TOP
  return (
    (top) + 
    (side << TextureOffset.side) + 
    (bottom << TextureOffset.bottom)
  );
}

export const blocks = {
  empty: {
    id: 0,
    name: 'empty'
  },
  grass: {
    id: 1,
    name: 'grass',
    textureIndex: combineOffsets(BlockTexture.grass, BlockTexture.grassSide, BlockTexture.dirt)
  },
  dirt: {
    id: 2,
    name: 'dirt',
    textureIndex: combineOffsets(BlockTexture.dirt)
  },
  stone: {
    id: 3,
    name: 'stone',
    textureIndex: combineOffsets(BlockTexture.stone),
    scale: { x: 30, y: 30, z: 30 },
    scarcity: 0.8
  },
  coalOre: {
    id: 4,
    name: 'coal_ore',
    textureIndex: combineOffsets(BlockTexture.coalOre),
    scale: { x: 20, y: 20, z: 20 },
    scarcity: 0.8
  },
  ironOre: {
    id: 5,
    name: 'iron_ore',
    textureIndex: combineOffsets(BlockTexture.ironOre),
    scale: { x: 40, y: 40, z: 40 },
    scarcity: 0.9
  },
  tree: {
    id: 6,
    name: 'tree',
    visible: true,
    textureIndex: combineOffsets(BlockTexture.treeTop, BlockTexture.treeSide, BlockTexture.treeTop),
  },
  leaves: {
    id: 7,
    name: 'leaves',
    visible: true,
    textureIndex: combineOffsets(BlockTexture.leaves)
  },
  sand: {
    id: 8,
    name: 'sand',
    visible: true,
    textureIndex: combineOffsets(BlockTexture.sand),
  },
  cloud: {
    id: 9,
    name: 'cloud',
    visible: true,
    textureIndex: combineOffsets(BlockTexture.cloud),
  }
};

export const resources = [
  blocks.stone,
  blocks.coalOre,
  blocks.ironOre
];
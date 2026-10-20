import type { Group } from 'three/webgpu';

/** The chair group currently in the scene, so AR export (outside React Three Fiber) can reach it. */
let chair: Group | null = null;

export const setChair = (group: Group | null) => {
  chair = group;
};

export const getChair = () => chair;

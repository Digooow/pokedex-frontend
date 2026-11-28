import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import type { Scene } from '@babylonjs/core/scene';

export async function enableStageHavokPhysics(
  scene: Scene,
  gravityY = -9.81,
): Promise<HavokPlugin> {
  const { default: loadHavok } = await import('@babylonjs/havok');
  const havok = await loadHavok({
    locateFile: (fileName: string) => `/assets/havok/${fileName}`,
  });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, gravityY, 0), plugin);
  return plugin;
}

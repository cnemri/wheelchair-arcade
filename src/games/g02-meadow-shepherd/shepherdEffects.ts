import * as THREE from 'three';

interface BellWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

export interface ShepherdEffects {
  group: THREE.Group;
  bellAttachment: THREE.Group;
  triggerBellWave(origin: THREE.Vector3): void;
  updateGuideArrow(
    playerPos: THREE.Vector3,
    targetPos: THREE.Vector3 | null,
    isPaddockTarget: boolean,
    elapsed: number,
  ): void;
  update(dt: number, elapsed: number): void;
  reset(): void;
  dispose(): void;
}

export function createShepherdEffects(): ShepherdEffects {
  const group = new THREE.Group();
  group.name = 'shepherd_effects';

  // 1. Handcrafted Miniature Brass Shepherd Bell mounted gently beside the chair's left frame
  const bellAttachment = new THREE.Group();
  bellAttachment.name = 'mounted_brass_bell';
  // Chair local frame (model pivot faces -Z, left is -X in -Z-forward coords? Wait:
  // In Three.js facing -Z with +Y up, Right = +X and Left = -X! Let's place it cleanly on left side (-0.36, 0.72, -0.18))
  bellAttachment.position.set(-0.36, 0.76, -0.18);

  const brassMat = new THREE.MeshStandardMaterial({
    color: '#f2c85b',
    emissive: '#8f5d00',
    emissiveIntensity: 0.12,
    metalness: 0.86,
    roughness: 0.24,
  });
  const darkBracketMat = new THREE.MeshStandardMaterial({
    color: '#2d2926',
    metalness: 0.65,
    roughness: 0.45,
  });

  const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), darkBracketMat);
  bracket.rotation.z = Math.PI * 0.5;
  bracket.position.x = 0.06;
  bellAttachment.add(bracket);

  const bellPivot = new THREE.Group();
  const bellCup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.072, 0.11, 12, 1, false), brassMat);
  bellCup.position.y = -0.055;
  bellCup.castShadow = true;
  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.012, 6, 14), brassMat);
  bellRim.rotation.x = Math.PI * 0.5;
  bellRim.position.y = -0.11;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), brassMat);
  clapper.position.y = -0.115;
  bellPivot.add(bellCup, bellRim, clapper);
  bellAttachment.add(bellPivot);

  // 2. Pool of Expanding Golden Bell Sound-Wave Rings
  const waves: BellWave[] = [];
  const ringGeo = new THREE.TorusGeometry(1.0, 0.048, 8, 48);
  ringGeo.rotateX(Math.PI * 0.5);

  const bellFlashLight = new THREE.PointLight('#ffe078', 0, 14, 1.6);
  group.add(bellFlashLight);

  let bellSwingTimer = 0;

  // 3. Tasteful Pastoral Ground Guide Chevron (points softly toward nearest stray sheep or paddock gate)
  const guideGroup = new THREE.Group();
  guideGroup.name = 'shepherd_guide_chevron';

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.46);
  arrowShape.lineTo(0.32, -0.14);
  arrowShape.lineTo(0.11, -0.04);
  arrowShape.lineTo(0, -0.2);
  arrowShape.lineTo(-0.11, -0.04);
  arrowShape.lineTo(-0.32, -0.14);
  arrowShape.closePath();

  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  arrowGeo.rotateX(-Math.PI * 0.5);
  const arrowMat = new THREE.MeshBasicMaterial({
    color: '#ffe066',
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.position.set(0, 0.12, -1.55); // Placed cleanly 1.55m ahead of guide pivot
  guideGroup.add(arrowMesh);
  group.add(guideGroup);

  const triggerBellWave = (origin: THREE.Vector3) => {
    bellSwingTimer = 0.85;
    bellFlashLight.position.set(origin.x, origin.y + 1.3, origin.z);
    bellFlashLight.intensity = 3.6;

    // Emit two staggered warm golden acoustic rings for crisp tactile feedback!
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.MeshBasicMaterial({
        color: k === 0 ? '#ffe680' : '#ffcf4d',
        transparent: true,
        opacity: k === 0 ? 0.88 : 0.65,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.set(origin.x, origin.y + 0.55 + k * 0.25, origin.z);
      mesh.scale.setScalar(0.5);
      group.add(mesh);
      waves.push({
        mesh,
        mat,
        age: -k * 0.11,
        maxAge: 0.78 + k * 0.14,
        maxRadius: 15.8 - k * 2.2,
      });
    }
  };

  const updateGuideArrow = (
    playerPos: THREE.Vector3,
    targetPos: THREE.Vector3 | null,
    isPaddockTarget: boolean,
    elapsed: number,
  ) => {
    if (!targetPos) {
      guideGroup.visible = false;
      return;
    }
    const dx = targetPos.x - playerPos.x;
    const dz = targetPos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4.5) {
      guideGroup.visible = false;
      return;
    }
    guideGroup.visible = true;
    guideGroup.position.set(playerPos.x, playerPos.y + 0.08, playerPos.z);
    // Arrow mesh is at local -Z, so yaw = atan2(-dx, -dz) points directly at targetPos
    guideGroup.rotation.y = Math.atan2(-dx, -dz);
    const pulse = 0.88 + Math.sin(elapsed * 4.2) * 0.12;
    arrowMesh.scale.setScalar(pulse);
    arrowMat.color.set(isPaddockTarget ? '#ffe066' : '#a9ec79');
    arrowMat.opacity = 0.52 + Math.sin(elapsed * 4.2) * 0.22;
  };

  const update = (dt: number, elapsed: number) => {
    // Animate miniature brass bell jingle & golden glow
    if (bellSwingTimer > 0) {
      bellSwingTimer = Math.max(0, bellSwingTimer - dt);
      const decay = bellSwingTimer / 0.85;
      bellPivot.rotation.z = Math.sin(elapsed * 38) * 0.55 * decay;
      bellPivot.rotation.x = Math.cos(elapsed * 32) * 0.22 * decay;
      brassMat.emissiveIntensity = 0.12 + decay * 1.4;
    } else {
      bellPivot.rotation.z *= Math.exp(-dt * 8);
      bellPivot.rotation.x *= Math.exp(-dt * 8);
      brassMat.emissiveIntensity = 0.12;
    }

    if (bellFlashLight.intensity > 0.01) {
      bellFlashLight.intensity *= Math.exp(-dt * 6.5);
    } else {
      bellFlashLight.intensity = 0;
    }

    // Update expanding acoustic rings
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.age += dt;
      if (w.age < 0) {
        w.mesh.visible = false;
        continue;
      }
      w.mesh.visible = true;
      const t = w.age / w.maxAge;
      if (t >= 1) {
        group.remove(w.mesh);
        w.mat.dispose();
        waves.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - t, 2.2);
      const r = 0.6 + ease * w.maxRadius;
      w.mesh.scale.set(r, 1.0, r);
      w.mat.opacity = (1 - t) * (1 - t) * 0.85;
    }
  };

  const reset = () => {
    for (const w of waves) {
      group.remove(w.mesh);
      w.mat.dispose();
    }
    waves.length = 0;
    bellSwingTimer = 0;
    bellFlashLight.intensity = 0;
    bellPivot.rotation.set(0, 0, 0);
  };

  const dispose = () => {
    reset();
    ringGeo.dispose();
  };

  return {
    group,
    bellAttachment,
    triggerBellWave,
    updateGuideArrow,
    update,
    reset,
    dispose,
  };
}

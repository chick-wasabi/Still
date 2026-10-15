import * as THREE from 'three';

// Reused glyph texture and particle buffers. Original React text is never wrapped.
export function createMouthProps(model, scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d'),
    texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const glyph = new THREE.Sprite(material),
    released = new THREE.Sprite(material.clone());
  model.attachToMouth(glyph);
  glyph.position.set(0, 0, 0);
  const parentScale = glyph.parent.getWorldScale(new THREE.Vector3());
  glyph.scale.set(0.5 / parentScale.x, 0.5 / parentScale.y, 1 / parentScale.z);
  released.scale.set(0.5, 0.5, 1);
  scene.add(released);
  const positions = new Float32Array(36),
    velocities = new Float32Array(36);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: '#f1d69e',
      size: 0.045,
      transparent: true,
      depthTest: false,
    }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);
  glyph.visible = released.visible = sparks.visible = false;
  let previous = '',
    burst = null;
  function paint(text) {
    context.clearRect(0, 0, 96, 96);
    context.font = '600 68px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#f3dab0';
    context.shadowColor = '#dfb76e';
    context.shadowBlur = 4;
    context.fillText(text, 48, 48);
    texture.needsUpdate = true;
  }
  return {
    update(input, now) {
      if (input.stolenLetter && input.stolenLetter !== previous) paint(input.stolenLetter);
      previous = input.stolenLetter || '';
      glyph.visible = Boolean(previous) && !input.paused && !input.reduced;
      if (input.letterRelease && input.letterRelease !== burst) {
        burst = input.letterRelease;
        paint(burst.text);
        for (let i = 0; i < 36; i += 3) {
          velocities[i] = (Math.random() - 0.5) * 0.9;
          velocities[i + 1] = Math.random() * 0.65;
          velocities[i + 2] = 0;
        }
      }
      if (!input.letterRelease) burst = null;
      const t = burst ? now - burst.at : 1;
      const show = Boolean(burst) && t >= 0 && t < 0.7 && !input.paused && !input.reduced;
      released.visible = sparks.visible = show;
      if (show) {
        released.position.set(burst.x + t * 0.15, burst.y + t * 0.25 - t * t * 1.5, 2);
        released.material.opacity = 1 - t / 0.7;
        released.rotation.z = t * 1.8;
        for (let i = 0; i < 36; i += 3) {
          positions[i] = burst.x + velocities[i] * t;
          positions[i + 1] = burst.y + velocities[i + 1] * t - t * t * 0.8;
          positions[i + 2] = 2;
        }
        geometry.attributes.position.needsUpdate = true;
        sparks.material.opacity = 1 - t / 0.7;
      }
    },
    dispose() {
      glyph.removeFromParent();
      released.removeFromParent();
      sparks.removeFromParent();
      texture.dispose();
      material.dispose();
      released.material.dispose();
      geometry.dispose();
      sparks.material.dispose();
    },
  };
}

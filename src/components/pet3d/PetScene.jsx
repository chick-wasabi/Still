import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Physics,
  RigidBody,
  CuboidCollider,
  BallCollider,
  useBeforePhysicsStep,
  useRapier,
} from '@react-three/rapier';
import * as THREE from 'three';
import { createCatModel } from '../../lib/pet3d/catModel';
import { createDirector } from '../../lib/pet3d/director';
import { bindPetInput } from '../../lib/pet3d/input';
import { CAT, GRAVITY, worldToScreen, worldBounds } from '../../lib/pet3d/math';

function Platforms({ layout }) {
  const { bounds, boxes } = layout;
  const edge = worldBounds(bounds),
    cx = (edge.left + edge.right) / 2,
    cy = (edge.top + edge.bottom) / 2;
  const edges = [
    {
      id: 'floor',
      kind: 'floor',
      x: cx,
      y: edge.bottom + 0.025,
      w: bounds.width / 2,
      h: 0.055,
    },
    { id: 'left', kind: 'wall', x: edge.left - 0.05, y: cy, w: 0.05, h: bounds.height / 2 },
    { id: 'right', kind: 'wall', x: edge.right + 0.05, y: cy, w: 0.05, h: bounds.height / 2 },
    {
      id: 'ceiling',
      kind: 'wall',
      x: cx,
      y: edge.top + 0.05,
      w: bounds.width / 2,
      h: 0.05,
    },
  ];
  return (
    <>
      {boxes.map((box) => (
        <RigidBody
          key={box.id}
          type="fixed"
          colliders={false}
          position={[(box.left + box.right) / 2, (box.top + box.bottom) / 2, 0]}
          userData={{ kind: box.kind === 'wall' ? 'wall' : 'platform', id: box.id }}
        >
          <CuboidCollider
            args={[(box.right - box.left) / 2, (box.top - box.bottom) / 2, 0.65]}
            friction={0.9}
            restitution={0.05}
          />
        </RigidBody>
      ))}
      {edges.map((edge) => (
        <RigidBody
          key={edge.id}
          type="fixed"
          colliders={false}
          position={[edge.x, edge.y, 0]}
          userData={{ kind: edge.kind, id: edge.id }}
        >
          <CuboidCollider args={[edge.w, edge.h, 0.7]} friction={0.8} restitution={0.15} />
        </RigidBody>
      ))}
    </>
  );
}

function CursorModel({ group, input }) {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.015, -0.35);
    s.lineTo(0.105, -0.25);
    s.lineTo(0.19, -0.42);
    s.lineTo(0.255, -0.385);
    s.lineTo(0.172, -0.225);
    s.lineTo(0.32, -0.22);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      steps: 1,
    });
  }, []);
  const arrow = useRef(),
    text = useRef();
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = input.cursorActive && !input.paused && !input.reduced;
    arrow.current.visible = input.cursorType !== 'text' || input.held;
    text.current.visible = !arrow.current.visible;
  });
  return (
    <group ref={group} scale={1.8} visible={false} renderOrder={20}>
      <mesh ref={arrow} geometry={geometry}>
        <meshStandardMaterial
          color={input.held ? '#f6df9d' : '#fff9ed'}
          metalness={0.25}
          roughness={0.3}
          depthTest={false}
        />
      </mesh>
      <group ref={text}>
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.018, 0.3, 0.025]} />
          <meshBasicMaterial color="#fff4dc" depthTest={false} />
        </mesh>
        {[-0.15, 0.15].map((y) => (
          <mesh key={y} position={[0, y, 0.05]}>
            <boxGeometry args={[0.11, 0.018, 0.025]} />
            <meshBasicMaterial color="#fff4dc" depthTest={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Actors({ layout, input, layer, onReady }) {
  const cat = useRef(),
    ball = useRef(),
    ballMesh = useRef(),
    ballVisual = useRef(),
    visual = useRef(),
    cursor = useRef(),
    director = useRef();
  const shadow = useRef(),
    ballShadow = useRef();
  const yarn = useMemo(() => {
    const points = Array.from({ length: 181 }, (_, i) => {
      const t = (i / 180) * Math.PI * 12,
        latitude = Math.sin(t * 0.41) * 1.25;
      return new THREE.Vector3(
        Math.cos(t) * Math.cos(latitude) * 0.151,
        Math.sin(latitude) * 0.151,
        Math.sin(t) * Math.cos(latitude) * 0.151,
      );
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 180, 0.008, 3, false);
  }, []);
  useEffect(() => () => yarn.dispose(), [yarn]);
  const model = useMemo(createCatModel, []),
    currentLayout = useRef(layout);
  currentLayout.current = layout;
  const { world, rapier } = useRapier();
  const { camera, scene, invalidate, gl, setDpr } = useThree();
  const mouth = useMemo(() => new THREE.Vector3(), []);
  const petPoint = useMemo(() => new THREE.Vector3(), []);
  const cursorPoint = useMemo(() => new THREE.Vector3(), []);
  const frameStats = useRef({ frames: 0, total: 0, telemetry: 0, dpr: 1 });
  useEffect(() => {
    const ai = createDirector({
      cat: cat.current,
      ball: ball.current,
      world,
      rapier,
      input,
      layout: () => currentLayout.current,
      notify: (mode) => {
        if (layer.current) layer.current.dataset.behavior = mode;
      },
    });
    director.current = ai;
    ai.initialize();
    const unbind = bindPetInput({
      input,
      camera,
      catMesh: model.mesh,
      ballMesh: ballMesh.current,
      cat: cat.current,
      ball: ball.current,
      rapier,
      director: ai,
      layout: () => currentLayout.current,
      invalidate,
      cursor,
    });
    let disposed = false;
    // Prewarm all pose/cursor materials, including invisible text-caret meshes.
    // Native cursor stays available until the GPU programs are ready.
    gl.compileAsync(scene, camera)
      .then(() => {
        if (!disposed) {
          input.ready = true;
          onReady();
        }
      })
      .catch(() => {
        if (!disposed)
          gl.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      });
    return () => {
      disposed = true;
      input.ready = false;
      unbind();
      ai.dispose();
      director.current = null;
    };
  }, [camera, scene, gl, world, rapier, input, model, invalidate, onReady, layer]);
  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => {
    director.current?.syncActors();
    if (input.reduced && director.current && visual.current && ballMesh.current) {
      director.current.reconcile();
      const c = cat.current.translation(),
        b = ball.current.translation();
      visual.current.parent.position.set(c.x, c.y, c.z);
      ballVisual.current.parent.position.set(b.x, b.y, b.z);
      input.grounded = true;
      if (layer.current) layer.current.dataset.behavior = 'sleep';
      invalidate();
    } else if (layer.current) layer.current.dataset.behavior = input.mode;
  }, [
    input.catEnabled,
    input.ballEnabled,
    input.reduced,
    layout.revision,
    input,
    layer,
    invalidate,
  ]);

  useBeforePhysicsStep(() => {
    if (input.ready && !input.paused && !input.reduced) director.current?.step(1 / 60);
  });
  useFrame((_, dt) => {
    if (visual.current) visual.current.visible = input.catEnabled;
    if (ballVisual.current) ballVisual.current.visible = input.ballEnabled;
    const mode = input.reduced ? 'sleep' : input.mode;
    if (visual.current && input.catEnabled) {
      const target = input.facing < 0 ? Math.PI + 0.16 : -0.16;
      visual.current.rotation.y = THREE.MathUtils.damp(
        visual.current.rotation.y,
        target,
        10,
        Math.min(dt, 0.05),
      );
      visual.current.updateMatrixWorld(true);
      const look = input.cursorActive
        ? THREE.MathUtils.clamp((input.worldPointer.x - input.catPosition.x) / 3, -1, 1)
        : 0;
      model.update(
        mode,
        input.stateTime,
        Math.min(dt, 0.05),
        input.speed,
        look,
        input.reduced,
        input.facing,
        input.held || input.carryingBall,
      );
    }
    model.mouthPosition(mouth);
    input.mouth.x = mouth.x;
    input.mouth.y = mouth.y;
    if (cursor.current) {
      if (input.held) {
        model.mouthPosition(mouth);
        const t = THREE.MathUtils.clamp((input.time - input.grabAt) / 0.45, 0, 1);
        cursorPoint
          .set(input.worldPointer.x, input.worldPointer.y, 5)
          .lerp(mouth, t * t * (3 - 2 * t));
        cursor.current.position.copy(cursorPoint);
        cursor.current.position.z += 0.08;
        cursor.current.rotation.z = Math.sin(input.stateTime * 3) * 0.16 - 0.3;
      } else {
        cursor.current.position.set(input.worldPointer.x, input.worldPointer.y, 5);
        cursor.current.rotation.z = 0;
      }
    }
    const p = cat.current?.translation(),
      b = ball.current?.translation();
    if (p && shadow.current) {
      shadow.current.position.set(p.x, p.y - CAT.halfHeight - 0.008, -0.05);
      shadow.current.scale.set(1, 0.075, 1);
      shadow.current.visible = input.grounded && input.catEnabled;
    }
    if (b && ballShadow.current) {
      ballShadow.current.position.set(b.x, b.y - 0.15, -0.05);
      ballShadow.current.scale.set(0.28, 0.03, 1);
      ballShadow.current.visible = input.ballEnabled;
    }
    const bubble = layer.current?.querySelector('.pet3d-bubble'),
      letter = layer.current?.querySelector('.pet3d-letter');
    if (bubble && p) {
      const show =
        input.catEnabled &&
        !input.paused &&
        !input.reduced &&
        input.bubble &&
        input.bubble.until > input.time;
      bubble.style.display = show ? 'block' : 'none';
      if (show) {
        if (bubble.textContent !== input.bubble.text) bubble.textContent = input.bubble.text;
        const view = currentLayout.current.view;
        bubble.style.transform = `translate3d(${Math.max(8, Math.min(view.width - 110, p.x * view.unit + 15))}px,${-p.y * view.unit - 60}px,0)`;
      }
    }
    if (letter) {
      const show =
        input.catEnabled && !input.paused && !input.reduced && Boolean(input.stolenLetter);
      letter.style.display = show ? 'block' : 'none';
      if (show) {
        if (letter.textContent !== input.stolenLetter) letter.textContent = input.stolenLetter;
        letter.style.transform = `translate3d(${mouth.x * currentLayout.current.view.unit + 2}px,${-mouth.y * currentLayout.current.view.unit - 9}px,0) rotate(${Math.sin(input.time * 3) * 12}deg)`;
      }
    }
    const stats = frameStats.current;
    stats.frames++;
    stats.total += dt;
    stats.telemetry += dt;
    if (stats.frames >= 30) {
      // Bound fill rate on smaller GPUs, avoiding a React render on performance changes.
      const average = stats.total / stats.frames;
      const desired =
        average > 0.045
          ? Math.min(stats.dpr, 0.8)
          : average > 0.027
            ? Math.min(stats.dpr, 0.8)
            : stats.dpr;
      if (desired !== stats.dpr) {
        stats.dpr = desired;
        setDpr(desired);
      }
      stats.frames = 0;
      stats.total = 0;
    }
    if (stats.telemetry > 0.12 && p && b && layer.current) {
      stats.telemetry = 0;
      model.byName.spine.getWorldPosition(petPoint);
      const pick = worldToScreen(petPoint.x, petPoint.y, currentLayout.current.view);
      const c = worldToScreen(p.x, p.y, currentLayout.current.view),
        toy = worldToScreen(b.x, b.y, currentLayout.current.view),
        rect = input.host.getBoundingClientRect();
      Object.assign(layer.current.dataset, {
        catX: (c.x + rect.left).toFixed(1),
        catPickX: (pick.x + rect.left).toFixed(1),
        catPickY: (pick.y + rect.top).toFixed(1),
        catY: (c.y + rect.top).toFixed(1),
        ballX: (toy.x + rect.left).toFixed(1),
        ballY: (toy.y + rect.top).toFixed(1),
        catDocumentX: c.x.toFixed(2),
        catDocumentY: c.y.toFixed(2),
        ballDocumentX: toy.x.toFixed(2),
        ballDocumentY: toy.y.toFixed(2),
        carryingBall: String(input.carryingBall),
        stolenLetter: input.stolenLetter || '',
        reactionCount: String(input.reactionCount || 0),
        spawnSurface: input.spawnSurface || '',
        spawnBehavior: input.spawnBehavior || '',
        ballVisible: String(input.ballEnabled),
        playingBall: String(director.current?.playingBall || false),
        mouthDocumentX: String(input.mouth.x * currentLayout.current.view.unit),
        mouthDocumentY: String(-input.mouth.y * currentLayout.current.view.unit),
        worldRevision: String(input.worldRevision || 0),
        unit: String(currentLayout.current.view.unit),
        standingHeight: String(model.standingHeight * currentLayout.current.view.unit),
        rasterTop: String(input.raster.top),
        cursorDocumentX: String(cursor.current?.position.x * currentLayout.current.view.unit),
        cursorDocumentY: String(-cursor.current?.position.y * currentLayout.current.view.unit),
        grounded: String(input.grounded),
        holdingCursor: String(input.held),
        dragging: input.drag?.kind || 'none',
        tossSpeed: String(input.lastTossSpeed || 0),
        velocityX: cat.current.linvel().x.toFixed(2),
        velocityY: cat.current.linvel().y.toFixed(2),
        drawCalls: String(gl.info.render.calls),
        triangles: String(gl.info.render.triangles),
      });
    }
  });
  const accent = document.documentElement.dataset.workspaceTheme === 'work' ? '#a98aea' : '#9cc7b0';
  return (
    <>
      <RigidBody
        ref={cat}
        name="Still cat"
        colliders={false}
        position={[0, 2, 0]}
        enabledTranslations={[true, true, false]}
        enabledRotations={[false, false, false]}
        ccd
        mass={1.8}
        linearDamping={0}
        onCollisionEnter={(event) => {
          if (layer.current)
            layer.current.dataset.lastCollision =
              event.other.rigidBodyObject?.userData.kind || 'unknown';
          const other = event.other.rigidBodyObject?.userData;
          const normal = event.manifold.normal();
          if (Math.abs(normal.x) > 0.7) director.current?.impactWall(other?.id);
        }}
      >
        <CuboidCollider
          args={[CAT.halfWidth, CAT.halfHeight, CAT.depth]}
          mass={1.8}
          friction={0.8}
          restitution={0.03}
        />
        <group ref={visual}>
          <primitive object={model.mesh} />
        </group>
      </RigidBody>
      <RigidBody
        ref={ball}
        name="Cat toy ball"
        colliders={false}
        position={[1, 3, 0]}
        enabledTranslations={[true, true, false]}
        ccd
        linearDamping={1.05}
        angularDamping={1.5}
      >
        <BallCollider args={[0.13]} mass={0.32} restitution={0.28} friction={1.1} />
        <group ref={ballVisual}>
          <mesh ref={ballMesh}>
            <sphereGeometry args={[0.13, 20, 14]} />
            <meshStandardMaterial color={accent} roughness={0.42} metalness={0.12} />
          </mesh>
          <mesh geometry={yarn} scale={0.87}>
            <meshStandardMaterial color="#f5e3b4" roughness={0.9} />
          </mesh>
        </group>
      </RigidBody>
      <mesh ref={shadow}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#000e15" transparent opacity={0.23} depthWrite={false} />
      </mesh>
      <mesh ref={ballShadow}>
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial color="#000e15" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <CursorModel group={cursor} input={input} />
    </>
  );
}
function World({ layout, raster, input, layer, onReady, paused, reduced }) {
  const { camera, invalidate } = useThree();
  input.raster = raster;
  useLayoutEffect(() => {
    camera.position.x = layout.view.width / (2 * layout.view.unit);
    camera.position.y = -(raster.top + raster.height / 2) / layout.view.unit;
    camera.zoom = layout.view.unit;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, invalidate, layout.view.width, layout.view.unit, raster.top, raster.height]);
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#fff2dc', '#667e91', 0.85]} />
      <directionalLight position={[-4, 8, 12]} intensity={2.6} color="#fff0d6" />
      <directionalLight position={[5, 1, -4]} intensity={1.8} color="#a5cfde" />
      <Physics
        gravity={[0, -GRAVITY, 0]}
        timeStep={1 / 60}
        interpolate
        paused={paused || reduced}
        numSolverIterations={8}
      >
        <Platforms layout={layout} />
        <Actors {...{ layout, input, layer, onReady }} />
      </Physics>
    </>
  );
}
export default function PetScene({
  layout,
  raster,
  input,
  layer,
  onReady,
  onContextLost,
  paused,
  reduced,
}) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 40], zoom: layout.view.unit, near: 0.1, far: 100 }}
      dpr={1}
      frameloop={paused || reduced ? 'demand' : 'always'}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power', stencil: false }}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
      }}
    >
      <Suspense fallback={null}>
        <World {...{ layout, raster, input, layer, onReady, paused, reduced }} />
      </Suspense>
    </Canvas>
  );
}

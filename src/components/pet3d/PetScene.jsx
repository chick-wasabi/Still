import React, { Suspense, useEffect, useMemo, useRef } from 'react';
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
import { CAT, GRAVITY, worldToScreen } from '../../lib/pet3d/math';

function Platforms({ layout }) {
  const { bounds, boxes } = layout;
  const edges = [
    {
      id: 'floor',
      kind: 'floor',
      x: 0,
      y: -bounds.height / 2 + 0.025,
      w: bounds.width / 2,
      h: 0.055,
    },
    { id: 'left', kind: 'wall', x: -bounds.width / 2 - 0.05, y: 0, w: 0.05, h: bounds.height / 2 },
    { id: 'right', kind: 'wall', x: bounds.width / 2 + 0.05, y: 0, w: 0.05, h: bounds.height / 2 },
    {
      id: 'ceiling',
      kind: 'wall',
      x: 0,
      y: bounds.height / 2 + 0.05,
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
    <group ref={group} visible={false} renderOrder={20}>
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
    visual = useRef(),
    cursor = useRef(),
    director = useRef();
  const shadow = useRef(),
    ballShadow = useRef();
  const model = useMemo(createCatModel, []),
    currentLayout = useRef(layout);
  currentLayout.current = layout;
  const { world, rapier } = useRapier();
  const { camera, scene, invalidate, gl, setDpr } = useThree();
  const mouth = useMemo(() => new THREE.Vector3(), []);
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
    if (input.reduced && director.current && visual.current && ballMesh.current) {
      director.current.initialize();
      const c = cat.current.translation(),
        b = ball.current.translation();
      visual.current.parent.position.set(c.x, c.y, c.z);
      ballMesh.current.parent.position.set(b.x, b.y, b.z);
      input.grounded = true;
      if (layer.current) layer.current.dataset.behavior = 'sleep';
      invalidate();
    } else if (layer.current) layer.current.dataset.behavior = input.mode;
  }, [input.reduced, layout.revision, input, layer, invalidate]);

  useBeforePhysicsStep(() => {
    if (!input.paused && !input.reduced) director.current?.step(1 / 60);
  });
  useFrame((_, dt) => {
    const mode = input.reduced ? 'sleep' : input.mode;
    if (visual.current) {
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
        input.held,
      );
    }
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
      shadow.current.visible = input.grounded;
    }
    if (b && ballShadow.current) {
      ballShadow.current.position.set(b.x, b.y - 0.15, -0.05);
      ballShadow.current.scale.set(0.32, 0.035, 1);
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
          ? Math.min(stats.dpr, 0.6)
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
      const c = worldToScreen(p.x, p.y, currentLayout.current.view),
        toy = worldToScreen(b.x, b.y, currentLayout.current.view);
      Object.assign(layer.current.dataset, {
        catX: c.x.toFixed(1),
        catY: c.y.toFixed(1),
        ballX: toy.x.toFixed(1),
        ballY: toy.y.toFixed(1),
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
          if (event.other.rigidBodyObject?.userData.kind === 'wall') director.current?.impactWall();
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
        linearDamping={0.12}
        angularDamping={0.2}
      >
        <BallCollider args={[0.15]} mass={0.12} restitution={0.73} friction={0.65} />
        <mesh ref={ballMesh}>
          <sphereGeometry args={[0.15, 20, 14]} />
          <meshStandardMaterial color={accent} roughness={0.42} metalness={0.12} />
        </mesh>
        {[0, Math.PI / 2].map((angle) => (
          <mesh key={angle} rotation={[angle, 0, 0]}>
            <torusGeometry args={[0.15, 0.009, 5, 24]} />
            <meshStandardMaterial color="#f5e3b4" roughness={0.6} />
          </mesh>
        ))}
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
function World({ layout, input, layer, onReady, paused, reduced }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.zoom = layout.view.unit;
    camera.updateProjectionMatrix();
  }, [camera, layout.view.unit]);
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
        <World {...{ layout, input, layer, onReady, paused, reduced }} />
      </Suspense>
    </Canvas>
  );
}

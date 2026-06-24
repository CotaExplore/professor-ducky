import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function DuckMesh({ stateRef, mouthRef }) {
  const rootRef    = useRef();
  const jawRef     = useRef();
  const pupilLRef  = useRef();
  const pupilRRef  = useRef();
  const eyelidLRef = useRef();
  const eyelidRRef = useRef();
  const jawAngle   = useRef(0);
  const blinkRef   = useRef({ next: 3, active: false, t: 0 });

  useFrame(({ clock }) => {
    const now  = clock.getElapsedTime();
    const st   = stateRef.current;
    const speaking = st === 'speaking' || mouthRef.current;

    const bob  = Math.sin(now * 0.85) * 0.09 + Math.sin(now * 2.30) * 0.035 + Math.sin(now * 4.30) * 0.011;
    const sway = Math.sin(now * 0.53) * 0.032 + Math.sin(now * 1.88) * 0.011;
    const tilt = (Math.sin(now * 0.67) * 0.016 + Math.sin(now * 2.57) * 0.004)
               + (st === 'thinking'  ? -0.28 + Math.sin(now * 1.2) * 0.025 : 0)
               + (st === 'listening' ? Math.sin(now * 1.8) * 0.03 : 0);

    if (rootRef.current) {
      rootRef.current.position.y = bob;
      rootRef.current.position.x = sway;
      rootRef.current.rotation.z = tilt;
    }

    if (jawRef.current) {
      const target = speaking ? Math.abs(Math.sin(now * 7.8)) * 0.22 + 0.06 : 0;
      const cur    = jawAngle.current;
      const next   = cur + (target - cur) * (speaking ? 0.26 : 0.12);
      jawAngle.current = next;
      jawRef.current.rotation.x = next;
    }

    const px = Math.sin(now * 0.33) * 0.025 + Math.sin(now * 1.07) * 0.009;
    const py = Math.sin(now * 0.44) * 0.012 + (st === 'thinking' ? -0.035 : 0) + (st === 'listening' ? 0.008 : 0);

    if (pupilLRef.current) { pupilLRef.current.position.x = px; pupilLRef.current.position.y = py; }
    if (pupilRRef.current) { pupilRRef.current.position.x = px; pupilRRef.current.position.y = py; }

    const bl = blinkRef.current;
    if (!bl.active && now > bl.next) { bl.active = true; bl.t = now; }
    if (bl.active) {
      const el = now - bl.t;
      const sc = el < 0.08 ? el / 0.08 : el < 0.16 ? 1 - (el - 0.08) / 0.08 : 0;
      if (el > 0.16) { bl.active = false; bl.next = now + 2.2 + Math.random() * 3.8; }
      if (eyelidLRef.current) eyelidLRef.current.scale.y = sc;
      if (eyelidRRef.current) eyelidRRef.current.scale.y = sc;
    }
  });

  const bodyMat   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFD700', roughness: 0.28, metalness: 0.08 }), []);
  const billMat   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FF8C00', roughness: 0.45, metalness: 0.05 }), []);
  const billBotMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#E06800', roughness: 0.48, metalness: 0.04 }), []);
  const whiteMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F5EDD8' }), []);
  const catchMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: 'white', emissive: 'white', emissiveIntensity: 1 }), []);
  const wingMat   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#EDAA00', roughness: 0.35, metalness: 0.06 }), []);
  const tailMat   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#EDAA00', roughness: 0.4 }), []);
  const lidMat    = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFD000' }), []);

  return (
    <group ref={rootRef}>
      <mesh material={bodyMat} position={[0, -0.18, 0]} scale={[1, 0.78, 0.88]}><sphereGeometry args={[0.82, 48, 32]} /></mesh>
      <mesh position={[0.28, 0.22, 0.3]} scale={[0.38, 0.22, 0.22]}><sphereGeometry args={[1, 16, 16]} /><meshStandardMaterial color="#FFFDE0" transparent opacity={0.22} roughness={1} depthWrite={false} /></mesh>
      <mesh position={[0, -0.42, 0.35]} scale={[0.7, 0.5, 0.3]}><sphereGeometry args={[1, 16, 16]} /><meshStandardMaterial color="#FFFBE8" transparent opacity={0.14} roughness={1} depthWrite={false} /></mesh>
      <mesh material={wingMat} position={[-0.75, -0.14, -0.04]} rotation={[0.1, 0.18, 0.22]} scale={[0.28, 0.56, 0.38]}><sphereGeometry args={[1, 24, 16]} /></mesh>
      <mesh material={wingMat} position={[ 0.75, -0.14, -0.04]} rotation={[0.1, -0.18, -0.22]} scale={[0.28, 0.56, 0.38]}><sphereGeometry args={[1, 24, 16]} /></mesh>
      <mesh material={tailMat} position={[0, 0.02, -0.72]} rotation={[-0.55, 0, 0]} scale={[0.36, 0.42, 0.24]}><sphereGeometry args={[1, 16, 12]} /></mesh>
      <mesh material={bodyMat} position={[0, 0.55, 0.18]} scale={[0.58, 0.5, 0.52]}><sphereGeometry args={[0.72, 24, 16]} /></mesh>
      <mesh material={bodyMat} position={[0, 0.96, 0.28]}><sphereGeometry args={[0.52, 48, 32]} /></mesh>
      <mesh position={[-0.14, 1.14, 0.56]} scale={[0.24, 0.16, 0.14]}><sphereGeometry args={[1, 12, 12]} /><meshStandardMaterial color="#FFFFF0" transparent opacity={0.38} roughness={1} depthWrite={false} /></mesh>

      <group position={[-0.22, 1.02, 0.72]}>
        <mesh material={whiteMat}><sphereGeometry args={[0.116, 24, 16]} /></mesh>
        <mesh ref={pupilLRef} position={[0, 0, 0.07]}><sphereGeometry args={[0.066, 14, 12]} /><meshStandardMaterial color="#050200" /></mesh>
        <mesh material={catchMat} position={[-0.018, 0.025, 0.124]}><sphereGeometry args={[0.018, 8, 8]} /></mesh>
        <mesh ref={eyelidLRef} position={[0, 0.06, 0.04]} scale={[1, 0, 1]}><sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><primitive object={lidMat} attach="material" /></mesh>
      </group>

      <group position={[0.22, 1.02, 0.72]}>
        <mesh material={whiteMat}><sphereGeometry args={[0.116, 24, 16]} /></mesh>
        <mesh ref={pupilRRef} position={[0, 0, 0.07]}><sphereGeometry args={[0.066, 14, 12]} /><meshStandardMaterial color="#050200" /></mesh>
        <mesh material={catchMat} position={[0.018, 0.025, 0.124]}><sphereGeometry args={[0.018, 8, 8]} /></mesh>
        <mesh ref={eyelidRRef} position={[0, 0.06, 0.04]} scale={[1, 0, 1]}><sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><primitive object={lidMat} attach="material" /></mesh>
      </group>

      <mesh material={billMat} position={[0, 0.88, 0.82]} rotation={[0.26, 0, 0]} scale={[1, 0.42, 1]}><sphereGeometry args={[0.22, 24, 16]} /></mesh>
      <mesh material={billMat} position={[0, 0.91, 0.88]} rotation={[0.3, 0, 0]} scale={[0.08, 0.06, 0.3]}><boxGeometry args={[1, 1, 1]} /></mesh>

      <group ref={jawRef} position={[0, 0.84, 0.82]}>
        <mesh material={billBotMat} rotation={[0, 0, 0]} scale={[1, 0.32, 0.9]}><sphereGeometry args={[0.21, 24, 16]} /></mesh>
        <mesh position={[0, 0.04, 0.06]} scale={[0.8, 0.18, 0.7]}><sphereGeometry args={[0.2, 16, 12]} /><meshStandardMaterial color="#CC4400" roughness={0.7} /></mesh>
      </group>
    </group>
  );
}

function Scene({ stateRef, mouthRef }) {
  return (
    <>
      <ambientLight intensity={1.2} color="#c8e8f8" />
      <directionalLight position={[5, 12, 8]} intensity={3.0} color="#fff8e0" castShadow />
      <pointLight position={[-4, 3, 2]} intensity={0.5} color="#87ceeb" />
      <pointLight position={[0, -4, -4]} intensity={1.2} color="#00ccff" />
      <hemisphereLight skyColor="#87ceeb" groundColor="#1a6080" intensity={0.5} />
      <DuckMesh stateRef={stateRef} mouthRef={mouthRef} />
    </>
  );
}

export default function Duck3D({ state = 'idle', mouthOpen = false }) {
  const stateRef = useRef(state);
  const mouthRef = useRef(mouthOpen);
  stateRef.current = state;
  mouthRef.current = mouthOpen;

  return (
    <Canvas
      camera={{ position: [0, 1.5, 5], fov: 48 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      shadows
    >
      <Scene stateRef={stateRef} mouthRef={mouthRef} />
    </Canvas>
  );
}

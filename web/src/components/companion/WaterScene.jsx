import { useRef, useMemo } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Water } from 'three/examples/jsm/objects/Water.js';
import * as THREE from 'three';

extend({ Water });

function OceanWater() {
  const ref = useRef();
  const geom = useMemo(() => new THREE.PlaneGeometry(300, 300), []);
  const config = useMemo(() => ({
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load('/waternormals.jpg', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }),
    sunDirection: new THREE.Vector3(-1, 1, 1).normalize(),
    sunColor: 0xffffff,
    waterColor: 0x0077be,
    distortionScale: 4,
    alpha: 1.0,
    fog: false,
  }), []);

  useFrame((_, delta) => {
    if (ref.current) ref.current.material.uniforms.time.value += delta * 0.5;
  });

  return (
    <water ref={ref} args={[geom, config]} rotation-x={-Math.PI / 2} position={[0, 0, 0]} />
  );
}

export default function WaterScene() {
  return (
    <Canvas
      camera={{ position: [0, 12, 0], fov: 75, up: [0, 0, -1] }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      onCreated={({ scene }) => { scene.fog = new THREE.FogExp2('#87ceeb', 0.008); }}
    >
      <ambientLight intensity={1} />
      <directionalLight position={[100, 100, 100]} intensity={2} color="#fff8e0" />
      <OceanWater />
    </Canvas>
  );
}

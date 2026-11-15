import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildEquipmentGroup,
  createFloorTileTexture,
  createMachineTagSprite,
  createSpriteLabel,
  disposeObject3D,
} from '../three/equipmentFactory';
import type {
  CameraPreset,
  CrossingAlert,
  EditorTool,
  FlowRoute,
  FlowType,
  LabScenario,
} from '../types/lab';

export interface LabViewportHandle {
  capturePng: () => string | null;
  focusPoint: (x: number, z: number) => void;
}

export interface SelectionState {
  kind: 'equipment' | 'zone' | 'opening';
  id: string;
}

interface LabViewport3DProps {
  scenario: LabScenario;
  isDark: boolean;
  tool: EditorTool;
  cameraPreset: CameraPreset;
  cameraPresetTick: number;
  autoRotate: boolean;
  showLabels: boolean;
  activeFlows: Record<FlowType, boolean>;
  showCrossings: boolean;
  routes: FlowRoute[];
  crossings: CrossingAlert[];
  selection: SelectionState | null;
  onSelect: (sel: SelectionState | null) => void;
  onUserOrbitStart: () => void;
  onLiveDragCoords: (info: { label: string } | null) => void;
  onCommitMove: (kind: 'equipment' | 'zone' | 'opening', id: string, x: number, z: number) => void;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { pos: [14.5, 16.5, 19.5], target: [0, 0.3, 0] },
  top: { pos: [0, 26.5, 0.01], target: [0, 0, 0] },
  frontDoor: { pos: [-19.5, 6.2, 0.4], target: [-4.5, 0.5, 0] },
  backDoor: { pos: [19.5, 7.2, -3.5], target: [5.5, 0.5, -2.5] },
};

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersectPt = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function snapValue(val: number, step = 0.1): number {
  return Number((Math.round(val / step) * step).toFixed(2));
}

export const LabViewport3D = forwardRef<LabViewportHandle, LabViewport3DProps>(
  function LabViewport3D(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);

    // Mutable refs so WebGL loop & handlers never require tearing down renderer
    const propsRef = useRef(props);
    propsRef.current = props;

    const sceneCtxRef = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      isSoftwareGl: boolean;
      maxAnisotropy: number;
      labGroup: THREE.Group;
      flowGroup: THREE.Group;
      selectionHelper: THREE.Box3Helper;
      hoverHelper: THREE.Box3Helper;
      simsFootprint: THREE.Group;
      clickableRoots: THREE.Object3D[];
      entityMap: Map<string, THREE.Object3D>;
      flowAnimItems: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; offset: number; speed: number }[];
      camGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
      requestRender: () => void;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      capturePng: () => {
        const ctx = sceneCtxRef.current;
        if (!ctx) return null;
        ctx.renderer.render(ctx.scene, ctx.camera);
        return ctx.renderer.domElement.toDataURL('image/png');
      },
      focusPoint: (x: number, z: number) => {
        const ctx = sceneCtxRef.current;
        if (!ctx) return;
        ctx.camGoal = {
          pos: new THREE.Vector3(x + 4.5, 8.5, z + 6.5),
          target: new THREE.Vector3(x, 0.35, z),
        };
        ctx.requestRender();
      },
    }));

    // Initialize WebGL Scene once
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(propsRef.current.isDark ? 0x101715 : 0xf1f4f3);
      scene.fog = new THREE.Fog(propsRef.current.isDark ? 0x101715 : 0xf1f4f3, 38, 85);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmrem.dispose();

      const camera = new THREE.PerspectiveCamera(
        38,
        Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        0.1,
        200,
      );
      camera.position.set(...CAMERA_PRESETS.iso.pos);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minPolarAngle = 0.04;
      controls.minDistance = 4.5;
      controls.maxDistance = 48;
      controls.target.set(...CAMERA_PRESETS.iso.target);
      controls.autoRotateSpeed = 0.9;

      // 3-point balanced studio rig (1 shadow caster)
      const hemi = new THREE.HemisphereLight(0xf8fafc, 0xa8a59b, 0.85);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfffbf0, 1.05);
      keyLight.position.set(-14, 24, 15);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.left = -16;
      keyLight.shadow.camera.right = 16;
      keyLight.shadow.camera.top = 12;
      keyLight.shadow.camera.bottom = -12;
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 65;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.35);
      rimLight.position.set(16, 12, -16);
      scene.add(rimLight);

      const labGroup = new THREE.Group();
      const flowGroup = new THREE.Group();
      scene.add(labGroup, flowGroup);

      const selectionHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x0f766e));
      selectionHelper.visible = false;
      scene.add(selectionHelper);

      const hoverHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x38bdf8));
      hoverHelper.visible = false;
      scene.add(hoverHelper);

      // Sims 3D Green Tile Footprint Helper
      const simsFootprint = new THREE.Group();
      simsFootprint.visible = false;
      const footprintPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      footprintPlane.rotation.x = -Math.PI / 2;

      const footprintBorder = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
        new THREE.LineBasicMaterial({ color: 0x047857 }),
      );
      footprintBorder.rotation.x = -Math.PI / 2;

      const footprintArrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.28, 3),
        new THREE.MeshBasicMaterial({ color: 0x065f46 }),
      );
      footprintArrow.rotation.x = Math.PI / 2;
      footprintArrow.position.set(0, 0.015, -0.4);

      simsFootprint.add(footprintPlane, footprintBorder, footprintArrow);
      scene.add(simsFootprint);

      const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      // Frame / render loop management
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let disposed = false;
      const clock = new THREE.Clock();

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl.fenceSync) {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      const ctxObj = {
        renderer,
        scene,
        camera,
        controls,
        isSoftwareGl,
        maxAnisotropy,
        labGroup,
        flowGroup,
        selectionHelper,
        hoverHelper,
        simsFootprint,
        clickableRoots: [] as THREE.Object3D[],
        entityMap: new Map<string, THREE.Object3D>(),
        flowAnimItems: [] as {
          mesh: THREE.Mesh;
          curve: THREE.CatmullRomCurve3;
          offset: number;
          speed: number;
        }[],
        camGoal: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null,
        requestRender: () => {},
      };
      sceneCtxRef.current = ctxObj;

      function needsContinuousLoop(): boolean {
        const p = propsRef.current;
        const hasFlowAnim =
          !prefersReducedMotion &&
          ctxObj.flowAnimItems.length > 0 &&
          (p.activeFlows.specimen || p.activeFlows.waste || p.activeFlows.staff);
        return (
          ctxObj.camGoal !== null ||
          (p.autoRotate && !isSoftwareGl && !prefersReducedMotion) ||
          hasFlowAnim
        );
      }

      function stepScene(delta: number) {
        // Smooth camera preset damping
        if (ctxObj.camGoal) {
          const lambda = 7.5;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, ctxObj.camGoal.pos.x, lambda, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, ctxObj.camGoal.pos.y, lambda, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, ctxObj.camGoal.pos.z, lambda, delta);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, ctxObj.camGoal.target.x, lambda, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, ctxObj.camGoal.target.y, lambda, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, ctxObj.camGoal.target.z, lambda, delta);

          if (
            camera.position.distanceTo(ctxObj.camGoal.pos) < 0.04 &&
            controls.target.distanceTo(ctxObj.camGoal.target) < 0.04
          ) {
            camera.position.copy(ctxObj.camGoal.pos);
            controls.target.copy(ctxObj.camGoal.target);
            ctxObj.camGoal = null;
          }
        }

        const p = propsRef.current;
        controls.autoRotate = p.autoRotate && !isSoftwareGl && !prefersReducedMotion && p.tool !== 'move';
        controls.update();
      }

      function requestRender() {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame(() => {
          if (disposed) return;
          renderDirty = false;
          const delta = Math.min(0.05, clock.getDelta());
          stepScene(delta);
          renderer.render(scene, camera);

          const done = () => {
            renderBusy = false;
            if (disposed) return;
            if (renderDirty || needsContinuousLoop()) {
              requestRender();
            }
          };
          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      }
      ctxObj.requestRender = requestRender;

      // Resize observer
      const handleResize = () => {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        requestRender();
      };
      handleResize();
      const resizeObs = new ResizeObserver(handleResize);
      resizeObs.observe(container);

      // OrbitControls events
      controls.addEventListener('change', () => {
        requestRender();
      });
      controls.addEventListener('start', () => {
        ctxObj.camGoal = null;
        propsRef.current.onUserOrbitStart();
      });

      // WebGL context loss safety
      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => {
        setContextLost(false);
        requestRender();
      };
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

      // Pointer interaction: Hover, Click Select, Drag-Move, and Laser Measure
      let downPos: { x: number; y: number } | null = null;
      let dragTarget: {
        kind: 'equipment' | 'zone' | 'opening';
        id: string;
        obj: THREE.Object3D;
        offsetX: number;
        offsetZ: number;
        halfW: number;
        halfD: number;
        label: string;
      } | null = null;
      let lastHoverCheck = 0;

      const updateNdc = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const findEntityRoot = (obj: THREE.Object3D | null): THREE.Object3D | null => {
        let cur: THREE.Object3D | null = obj;
        while (cur) {
          if (cur.userData?.entityKind && cur.userData?.entityId) return cur;
          cur = cur.parent;
        }
        return null;
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        downPos = { x: e.clientX, y: e.clientY };
        updateNdc(e);
        _raycaster.setFromCamera(_ndc, camera);

        const currentTool = propsRef.current.tool;
        if (currentTool === 'move') {
          const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
          const hitRoot = hits.length > 0 ? findEntityRoot(hits[0].object) : null;
          if (hitRoot && _raycaster.ray.intersectPlane(_groundPlane, _intersectPt)) {
            const kind = hitRoot.userData.entityKind as 'equipment' | 'zone' | 'opening';
            const id = hitRoot.userData.entityId as string;
            const halfW = (hitRoot.userData.halfW as number) ?? 0.5;
            const halfD = (hitRoot.userData.halfD as number) ?? 0.5;
            const label = (hitRoot.userData.label as string) ?? id;

            controls.enabled = false;
            dragTarget = {
              kind,
              id,
              obj: hitRoot,
              offsetX: hitRoot.position.x - _intersectPt.x,
              offsetZ: hitRoot.position.z - _intersectPt.z,
              halfW,
              halfD,
              label,
            };
            propsRef.current.onSelect({ kind, id });
            renderer.domElement.setPointerCapture(e.pointerId);
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        updateNdc(e);

        if (dragTarget) {
          _raycaster.setFromCamera(_ndc, camera);
          if (_raycaster.ray.intersectPlane(_groundPlane, _intersectPt)) {
            const sc = propsRef.current.scenario;
            const maxX = sc.labWidth / 2 - dragTarget.halfW;
            const maxZ = sc.labDepth / 2 - dragTarget.halfD;
            const nx = THREE.MathUtils.clamp(snapValue(_intersectPt.x + dragTarget.offsetX, 0.1), -maxX, maxX);
            const nz = THREE.MathUtils.clamp(snapValue(_intersectPt.z + dragTarget.offsetZ, 0.1), -maxZ, maxZ);

            dragTarget.obj.position.x = nx;
            dragTarget.obj.position.z = nz;
            const attachedSprite = dragTarget.obj.userData?.labelSprite as THREE.Sprite | undefined;
            if (attachedSprite) {
              attachedSprite.position.x = nx;
              attachedSprite.position.z = nz;
            }
            ctxObj.selectionHelper.box.setFromObject(dragTarget.obj);
            ctxObj.selectionHelper.visible = true;
            ctxObj.simsFootprint.position.set(nx, 0.018, nz);
            ctxObj.simsFootprint.visible = true;
            propsRef.current.onLiveDragCoords({
              label: dragTarget.label,
            });
            requestRender();
          }
          return;
        }

        // Throttled hover raycast (20fps)
        const now = performance.now();
        if (now - lastHoverCheck < 50) return;
        lastHoverCheck = now;

        _raycaster.setFromCamera(_ndc, camera);
        const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
        const hitRoot = hits.length > 0 ? findEntityRoot(hits[0].object) : null;
        if (hitRoot) {
          renderer.domElement.style.cursor = propsRef.current.tool === 'move' ? 'grab' : 'pointer';
          ctxObj.hoverHelper.box.setFromObject(hitRoot);
          ctxObj.hoverHelper.visible = true;
        } else {
          renderer.domElement.style.cursor = 'default';
          ctxObj.hoverHelper.visible = false;
        }
        requestRender();
      };

      const onPointerUp = (e: PointerEvent) => {
        if (dragTarget) {
          const { kind, id, obj } = dragTarget;
          controls.enabled = true;
          try {
            renderer.domElement.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          dragTarget = null;
          propsRef.current.onLiveDragCoords(null);
          ctxObj.simsFootprint.position.set(Number(obj.position.x.toFixed(2)), 0.018, Number(obj.position.z.toFixed(2)));
          propsRef.current.onCommitMove(
            kind,
            id,
            Number(obj.position.x.toFixed(2)),
            Number(obj.position.z.toFixed(2)),
          );
          downPos = null;
          return;
        }

        if (!downPos) return;
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        downPos = null;
        if (moved > 6) return; // Was an orbit drag

        updateNdc(e);
        _raycaster.setFromCamera(_ndc, camera);

        const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
        const hitRoot = hits.length > 0 ? findEntityRoot(hits[0].object) : null;
        if (hitRoot) {
          propsRef.current.onSelect({
            kind: hitRoot.userData.entityKind,
            id: hitRoot.userData.entityId,
          });
        } else {
          // Sims Tap-to-Place: if equipment is selected or in 'move' tool, tapping floor moves it immediately!
          const currentSel = propsRef.current.selection;
          if (
            currentSel?.kind === 'equipment' &&
            _raycaster.ray.intersectPlane(_groundPlane, _intersectPt)
          ) {
            const sc = propsRef.current.scenario;
            const halfLabW = sc.labWidth / 2;
            const halfLabD = sc.labDepth / 2;
            if (
              Math.abs(_intersectPt.x) <= halfLabW + 0.5 &&
              Math.abs(_intersectPt.z) <= halfLabD + 0.5
            ) {
              const eqItem = sc.equipment.find((item) => item.id === currentSel.id);
              const halfW = eqItem ? eqItem.width / 2 : 0.4;
              const halfD = eqItem ? eqItem.depth / 2 : 0.4;
              const maxX = halfLabW - halfW;
              const maxZ = halfLabD - halfD;
              const snapStep = 0.25; // Sims-style 0.25m grid snap
              const targetX = THREE.MathUtils.clamp(
                snapValue(_intersectPt.x, snapStep),
                -maxX,
                maxX,
              );
              const targetZ = THREE.MathUtils.clamp(
                snapValue(_intersectPt.z, snapStep),
                -maxZ,
                maxZ,
              );

              propsRef.current.onCommitMove(
                currentSel.kind,
                currentSel.id,
                Number(targetX.toFixed(2)),
                Number(targetZ.toFixed(2)),
              );
              return;
            }
          }
          propsRef.current.onSelect(null);
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);

      requestRender();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObs.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
        disposeObject3D(scene);
        envTex.dispose();
        controls.dispose();
        renderer.dispose();
        sceneCtxRef.current = null;
      };
    }, []);

    // Update theme background & fog
    useEffect(() => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const bgHex = props.isDark ? 0x101715 : 0xf1f4f3;
      ctx.scene.background = new THREE.Color(bgHex);
      ctx.scene.fog = new THREE.Fog(bgHex, 38, 85);
      ctx.requestRender();
    }, [props.isDark]);

    // Trigger camera preset smooth transitions
    useEffect(() => {
      const ctx = sceneCtxRef.current;
      if (!ctx || props.cameraPresetTick === 0) return;
      const p = CAMERA_PRESETS[props.cameraPreset];
      ctx.camGoal = {
        pos: new THREE.Vector3(...p.pos),
        target: new THREE.Vector3(...p.target),
      };
      ctx.requestRender();
    }, [props.cameraPreset, props.cameraPresetTick]);

    // Trigger continuous render when autoRotate changes
    useEffect(() => {
      sceneCtxRef.current?.requestRender();
    }, [props.autoRotate]);

    // Rebuild lab geometry when scenario / dark mode / labels change
    useEffect(() => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const { labGroup, maxAnisotropy } = ctx;
      disposeObject3D(labGroup);
      labGroup.clear();
      ctx.clickableRoots = [];
      ctx.entityMap.clear();

      const { scenario, isDark, showLabels } = props;

      // Base structural floor slab
      const floorTex = createFloorTileTexture(
        isDark,
        maxAnisotropy,
        scenario.labWidth,
        scenario.labDepth,
      );
      const slabMesh = new THREE.Mesh(
        new THREE.BoxGeometry(scenario.labWidth, 0.12, scenario.labDepth),
        new THREE.MeshStandardMaterial({
          map: floorTex,
          roughness: 0.85,
          metalness: 0.02,
        }),
      );
      slabMesh.position.set(0, -0.06, 0);
      slabMesh.receiveShadow = true;
      labGroup.add(slabMesh);

      // Zones (clickable floor overlays + sprite labels)
      const neutralMix = new THREE.Color(isDark ? 0x1e2825 : 0xeeece6);
      for (const zone of scenario.zones) {
        const zGroup = new THREE.Group();
        zGroup.position.set(zone.x, 0, zone.z);
        zGroup.userData = {
          entityKind: 'zone',
          entityId: zone.id,
          halfW: zone.width / 2,
          halfD: zone.depth / 2,
          label: zone.nameTh,
        };

        const tinted = new THREE.Color(zone.color).lerp(neutralMix, isDark ? 0.58 : 0.48);
        const padMat = new THREE.MeshStandardMaterial({
          color: tinted,
          roughness: 0.82,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.4, zone.width - 0.1), 0.025, Math.max(0.4, zone.depth - 0.1)),
          padMat,
        );
        pad.position.set(0, 0.014, 0);
        pad.receiveShadow = true;
        zGroup.add(pad);

        if (showLabels) {
          const scaleFactor = zone.width < 2.5 ? 0.68 : 0.92;
          const spr = createSpriteLabel(zone.name, undefined, isDark, maxAnisotropy, scaleFactor);
          spr.position.set(0, 1.98, 0);
          zGroup.add(spr);
        }

        labGroup.add(zGroup);
        ctx.clickableRoots.push(zGroup);
        ctx.entityMap.set(`zone:${zone.id}`, zGroup);
      }

      // Equipment items (composite 3-12 part groups)
      for (const item of scenario.equipment) {
        const eqGroup = buildEquipmentGroup(item);
        eqGroup.position.set(item.x, item.baseY, item.z);
        eqGroup.rotation.y = THREE.MathUtils.degToRad(item.rotationDeg);
        eqGroup.userData = {
          entityKind: 'equipment',
          entityId: item.id,
          halfW: item.width / 2,
          halfD: item.depth / 2,
          label: item.labelTh,
        };
        if (showLabels && item.showNameTag) {
          const tag = createMachineTagSprite(item.label, isDark, maxAnisotropy);
          tag.position.set(item.x, item.baseY + item.height + 0.34, item.z);
          labGroup.add(tag);
          eqGroup.userData.labelSprite = tag;
        }
        labGroup.add(eqGroup);
        ctx.clickableRoots.push(eqGroup);
        ctx.entityMap.set(`equipment:${item.id}`, eqGroup);
      }

      // Walls
      for (const wall of scenario.walls) {
        const wMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x64748b : 0xcfcbc0,
          roughness: 0.72,
          transparent: true,
          opacity: wall.opacity,
        });
        const wMesh = new THREE.Mesh(new THREE.BoxGeometry(wall.width, wall.height, wall.depth), wMat);
        wMesh.position.set(wall.x, wall.height / 2, wall.z);
        wMesh.receiveShadow = true;
        labGroup.add(wMesh);
      }

      // Openings (doors & windows)
      for (const op of scenario.openings) {
        if (op.kind === 'window') {
          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(op.width, 1.0, op.depth + 0.02),
            new THREE.MeshStandardMaterial({
              color: 0xa8d4f2,
              roughness: 0.15,
              transparent: true,
              opacity: 0.48,
            }),
          );
          glass.position.set(op.x, 1.1, op.z);
          labGroup.add(glass);

          const sill = new THREE.Mesh(
            new THREE.BoxGeometry(op.width, 0.05, op.depth + 0.04),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }),
          );
          sill.position.set(op.x, 0.6, op.z);
          labGroup.add(sill);
        } else if (op.kind === 'slidingWindow') {
          const sGroup = new THREE.Group();
          sGroup.position.set(op.x, 0, op.z);
          sGroup.userData = {
            entityKind: 'opening',
            entityId: op.id,
            halfW: Math.max(0.25, op.width / 2),
            halfD: Math.max(0.25, op.depth / 2),
            label: op.labelTh,
          };

          const isHorizontal = op.width >= op.depth;
          const span = isHorizontal ? op.width : op.depth;
          const thick = isHorizontal ? op.depth : op.width;

          // Lower wall under pass-through counter
          const baseWall = new THREE.Mesh(
            new THREE.BoxGeometry(isHorizontal ? span : thick, 0.72, isHorizontal ? thick : span),
            new THREE.MeshStandardMaterial({ color: isDark ? 0x475569 : 0xcfcbc0, roughness: 0.75 }),
          );
          baseWall.position.set(0, 0.36, 0);
          sGroup.add(baseWall);

          // Pass-through counter sill
          const sill = new THREE.Mesh(
            new THREE.BoxGeometry(isHorizontal ? span + 0.04 : thick + 0.24, 0.05, isHorizontal ? thick + 0.24 : span + 0.04),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.32 }),
          );
          sill.position.set(0, 0.74, 0);
          sGroup.add(sill);

          // Dual sliding glass panes (one partially open)
          const paneMat = new THREE.MeshStandardMaterial({
            color: 0x7dd3fc,
            roughness: 0.15,
            transparent: true,
            opacity: 0.56,
          });
          const pane1 = new THREE.Mesh(
            new THREE.BoxGeometry(isHorizontal ? span * 0.52 : 0.03, 0.72, isHorizontal ? 0.03 : span * 0.52),
            paneMat,
          );
          pane1.position.set(
            isHorizontal ? -span * 0.22 : -0.025,
            1.12,
            isHorizontal ? -0.025 : -span * 0.22,
          );
          const pane2 = new THREE.Mesh(
            new THREE.BoxGeometry(isHorizontal ? span * 0.52 : 0.03, 0.72, isHorizontal ? 0.03 : span * 0.52),
            paneMat,
          );
          pane2.position.set(
            isHorizontal ? span * 0.06 : 0.025,
            1.12,
            isHorizontal ? 0.025 : span * 0.06,
          );
          sGroup.add(pane1, pane2);

          // Top track bar
          const track = new THREE.Mesh(
            new THREE.BoxGeometry(isHorizontal ? span : thick + 0.06, 0.06, isHorizontal ? thick + 0.06 : span),
            new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.5 }),
          );
          track.position.set(0, 1.5, 0);
          sGroup.add(track);

          if (showLabels) {
            const spr = createMachineTagSprite(op.label, isDark, maxAnisotropy);
            spr.position.set(0, 1.82, 0);
            sGroup.add(spr);
          }

          labGroup.add(sGroup);
          ctx.clickableRoots.push(sGroup);
          ctx.entityMap.set(`opening:${op.id}`, sGroup);
        } else {
          const dGroup = new THREE.Group();
          dGroup.position.set(op.x, 0, op.z);
          dGroup.userData = {
            entityKind: 'opening',
            entityId: op.id,
            halfW: Math.max(0.2, op.width / 2),
            halfD: Math.max(0.2, op.depth / 2),
            label: op.labelTh,
          };
          const thresh = new THREE.Mesh(
            new THREE.BoxGeometry(op.width + 0.08, 0.12, op.depth + 0.08),
            new THREE.MeshStandardMaterial({ color: op.color, roughness: 0.45 }),
          );
          thresh.position.set(0, 0.06, 0);
          dGroup.add(thresh);

          if (showLabels) {
            const spr = createSpriteLabel(op.labelTh, undefined, isDark, maxAnisotropy, 0.78);
            spr.position.set(0, 0.9, 0);
            dGroup.add(spr);
          }
          labGroup.add(dGroup);
          ctx.clickableRoots.push(dGroup);
          ctx.entityMap.set(`opening:${op.id}`, dGroup);
        }
      }

      ctx.requestRender();
    }, [props.scenario, props.isDark, props.showLabels]);

    // Update Flow Paths & Crossings overlay (flat 2D lines + arrowheads)
    useEffect(() => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const { flowGroup } = ctx;
      disposeObject3D(flowGroup);
      flowGroup.clear();
      ctx.flowAnimItems = [];

      const heightMap: Record<FlowType, number> = {
        specimen: 0.052,
        waste: 0.058,
        staff: 0.046,
      };

      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(0, 0.19);
      arrowShape.lineTo(-0.13, -0.09);
      arrowShape.lineTo(0, -0.02);
      arrowShape.lineTo(0.13, -0.09);
      arrowShape.closePath();

      const lineWidth = 0.058;
      const dashLen = 0.24;
      const gapLen = 0.16;

      for (const route of props.routes) {
        const branches =
          route.segments && route.segments.length > 0 ? route.segments : [route.points];
        if (!props.activeFlows[route.type]) continue;

        const y = heightMap[route.type];
        const mat = new THREE.MeshBasicMaterial({
          color: route.color,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        });

        for (const branch of branches) {
          if (branch.length < 2) continue;

          for (let i = 1; i < branch.length; i++) {
            const p0 = branch[i - 1];
            const p1 = branch[i];
            const dx = p1.x - p0.x;
            const dz = p1.z - p0.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.05) continue;

            const angle = Math.atan2(dx, dz);
            const isLast = i === branch.length - 1;
            const drawLen = isLast ? Math.max(0.05, len - 0.12) : len;
            const ux = dx / len;
            const uz = dz / len;

            if (route.dashed) {
              let cursor = 0;
              while (cursor < drawLen - 0.02) {
                const seg = Math.min(dashLen, drawLen - cursor);
                const mid = cursor + seg / 2;
                const dGeo = new THREE.PlaneGeometry(lineWidth, seg);
                dGeo.rotateX(Math.PI / 2);
                const dMesh = new THREE.Mesh(dGeo, mat);
                dMesh.position.set(p0.x + ux * mid, y, p0.z + uz * mid);
                dMesh.rotation.y = angle;
                dMesh.renderOrder = 6;
                flowGroup.add(dMesh);
                cursor += dashLen + gapLen;
              }
            } else {
              const segGeo = new THREE.PlaneGeometry(lineWidth, drawLen);
              segGeo.rotateX(Math.PI / 2);
              const segMesh = new THREE.Mesh(segGeo, mat);
              segMesh.position.set(p0.x + ux * (drawLen / 2), y, p0.z + uz * (drawLen / 2));
              segMesh.rotation.y = angle;
              segMesh.renderOrder = 6;
              flowGroup.add(segMesh);

              if (!isLast) {
                const cornerGeo = new THREE.PlaneGeometry(lineWidth, lineWidth);
                cornerGeo.rotateX(Math.PI / 2);
                const cornerMesh = new THREE.Mesh(cornerGeo, mat);
                cornerMesh.position.set(p1.x, y, p1.z);
                cornerMesh.renderOrder = 6;
                flowGroup.add(cornerMesh);
              }
            }

            if (isLast) {
              const endArrowGeo = new THREE.ShapeGeometry(arrowShape);
              endArrowGeo.rotateX(Math.PI / 2);
              const endArrow = new THREE.Mesh(endArrowGeo, mat);
              endArrow.position.set(p1.x - ux * 0.11, y + 0.002, p1.z - uz * 0.11);
              endArrow.rotation.y = angle;
              endArrow.renderOrder = 7;
              flowGroup.add(endArrow);
            }
          }
        }
      }

      // Cross-Contamination warning markers
      if (props.showCrossings) {
        for (const alert of props.crossings) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.45, 0.06, 12, 24),
            new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 }),
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(alert.x, 0.08, alert.z);
          flowGroup.add(ring);

          const beacon = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.22, 0),
            new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, roughness: 0.25 }),
          );
          beacon.position.set(alert.x, 0.95, alert.z);
          flowGroup.add(beacon);

          const spr = createSpriteLabel('จุดตัดเสี่ยง IC', undefined, props.isDark, ctx.maxAnisotropy, 0.72);
          spr.position.set(alert.x, 1.55, alert.z);
          flowGroup.add(spr);
        }
      }

      ctx.requestRender();
    }, [props.routes, props.activeFlows, props.showCrossings, props.crossings, props.isDark]);

    // Update Selection Bounding Box Helper & Sims 3D Footprint
    useEffect(() => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      if (!props.selection) {
        ctx.selectionHelper.visible = false;
        ctx.simsFootprint.visible = false;
        ctx.requestRender();
        return;
      }
      const key = `${props.selection.kind}:${props.selection.id}`;
      const target = ctx.entityMap.get(key);
      if (target) {
        ctx.selectionHelper.box.setFromObject(target);
        ctx.selectionHelper.visible = true;

        if (props.selection.kind === 'equipment') {
          const eq = props.scenario.equipment.find((e) => e.id === props.selection?.id);
          if (eq) {
            ctx.simsFootprint.position.set(eq.x, 0.018, eq.z);
            ctx.simsFootprint.rotation.y = THREE.MathUtils.degToRad(-eq.rotationDeg);
            ctx.simsFootprint.scale.set(eq.width, 1, eq.depth);
            ctx.simsFootprint.visible = true;
          } else {
            ctx.simsFootprint.visible = false;
          }
        } else {
          ctx.simsFootprint.visible = false;
        }
      } else {
        ctx.selectionHelper.visible = false;
        ctx.simsFootprint.visible = false;
      }
      ctx.requestRender();
    }, [props.selection, props.scenario]);

    return (
      <div className="relative h-full w-full overflow-hidden">
        <div
          ref={mountRef}
          className="h-full w-full"
          aria-label="โมเดล 3 มิติ Digital Twin ห้องแลปกลาง"
        />
        {contextLost && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-100/95 p-6 text-center dark:bg-slate-900/95">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              การแสดงผล WebGL ถูกระงับชั่วคราว
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              กำลังกู้คืนบริบทกราฟิก 3 มิติ กรุณารอสักครู่หรือรีเฟรชหน้าเว็บ
            </p>
          </div>
        )}
      </div>
    );
  },
);

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildEquipmentGroup,
  createFloorTileTexture,
  createMachineTagSprite,
  createSpriteLabel,
  disposeObject3D,
} from '../three/equipmentFactory';
import { ENABLE_COMPLIANCE_ANALYSIS } from '../config/features';
import type {
  CameraPreset,
  CrossingAlert,
  EditorTool,
  FlowRoute,
  FlowType,
  LabScenario,
} from '../types/lab';
import {
  clampToRoom,
  findOverlaps,
  getFootprint,
  getItemAABB,
  snapToGrid,
  type SpatialBoxInput,
} from '../utils/placement';

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
  onCommitMove: (
    kind: 'equipment' | 'zone' | 'opening',
    id: string,
    x: number,
    z: number,
    rotationDeg?: number,
  ) => void;
  onNotice?: (msg: string) => void;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  reset: { pos: [14.5, 16.5, 19.5], target: [0, 0.3, 0] },
  iso: { pos: [14.5, 16.5, 19.5], target: [0, 0.3, 0] },
  top: { pos: [0, 26.5, 0.01], target: [0, 0, 0] },
  front: { pos: [0, 2, 22], target: [0, 0.3, 0] },
  side: { pos: [24, 6, 0], target: [0, 0.3, 0] },
  center: { pos: [0, 14, 18], target: [0, 0.3, 0] },
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

export const LabViewport3D = forwardRef<LabViewportHandle, LabViewport3DProps>(
  function LabViewport3D(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const compassDialRef = useRef<HTMLSpanElement | null>(null);
    const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
    const hoverTitleRef = useRef<HTMLDivElement | null>(null);
    const hoverHintRef = useRef<HTMLDivElement | null>(null);
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
      setFootprintColor: (isColliding: boolean) => void;
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
      scene.fog = new THREE.Fog(propsRef.current.isDark ? 0x101715 : 0xf1f4f3, 65, 165);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmrem.dispose();

      const camera = new THREE.PerspectiveCamera(
        38,
        Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        0.1,
        250,
      );
      camera.position.set(...CAMERA_PRESETS.iso.pos);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.08;
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.screenSpacePanning = true;
      controls.zoomToCursor = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      controls.minDistance = 1.0;
      controls.maxDistance = 80.0;
      controls.minPolarAngle = 0.04;
      controls.maxPolarAngle = Math.PI * 0.485;
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

      // Google Earth-style live pointer floor reticle (tracks mouse pointer on ground plane)
      const floorReticle = new THREE.Group();
      floorReticle.visible = false;
      const reticleRingMat = new THREE.MeshBasicMaterial({
        color: 0x0f766e,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const reticleRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.21, 32), reticleRingMat);
      reticleRing.rotation.x = -Math.PI / 2;
      const reticleDot = new THREE.Mesh(new THREE.CircleGeometry(0.042, 16), reticleRingMat);
      reticleDot.rotation.x = -Math.PI / 2;
      floorReticle.add(reticleRing, reticleDot);
      scene.add(floorReticle);

      // Google Earth-style orbit pivot crosshair shown while orbiting/panning camera angle
      const orbitPivot = new THREE.Group();
      orbitPivot.visible = false;
      const pivotMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const pivotRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), pivotMat);
      pivotRing.rotation.x = -Math.PI / 2;
      const pivotCrossX = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.03), pivotMat);
      pivotCrossX.rotation.x = -Math.PI / 2;
      const pivotCrossZ = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.56), pivotMat);
      pivotCrossZ.rotation.x = -Math.PI / 2;
      orbitPivot.add(pivotRing, pivotCrossX, pivotCrossZ);
      scene.add(orbitPivot);

      // Sims 3D Green/Red Tile Footprint Helper
      const simsFootprint = new THREE.Group();
      simsFootprint.visible = false;
      const footprintPlaneMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const footprintPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        footprintPlaneMat,
      );
      footprintPlane.rotation.x = -Math.PI / 2;

      const footprintBorderMat = new THREE.LineBasicMaterial({ color: 0x047857 });
      const footprintBorder = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
        footprintBorderMat,
      );
      footprintBorder.rotation.x = -Math.PI / 2;

      const footprintArrowMat = new THREE.MeshBasicMaterial({ color: 0x065f46 });
      const footprintArrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.28, 3),
        footprintArrowMat,
      );
      footprintArrow.rotation.x = Math.PI / 2;
      footprintArrow.position.set(0, 0.015, -0.4);

      simsFootprint.add(footprintPlane, footprintBorder, footprintArrow);
      scene.add(simsFootprint);

      const setFootprintColor = (isColliding: boolean) => {
        if (isColliding) {
          footprintPlaneMat.color.setHex(0xef4444);
          footprintBorderMat.color.setHex(0xb91c1c);
          footprintArrowMat.color.setHex(0x991b1b);
        } else {
          footprintPlaneMat.color.setHex(0x10b981);
          footprintBorderMat.color.setHex(0x047857);
          footprintArrowMat.color.setHex(0x065f46);
        }
      };

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
        setFootprintColor,
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

      const hideHoverTooltip = () => {
        if (hoverTooltipRef.current) {
          hoverTooltipRef.current.style.opacity = '0';
        }
      };

      const syncCompassRose = () => {
        if (!compassDialRef.current) return;
        const dx = camera.position.x - controls.target.x;
        const dz = camera.position.z - controls.target.z;
        const azDeg = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
        compassDialRef.current.style.transform = `rotate(${azDeg.toFixed(1)}deg)`;
      };
      syncCompassRose();

      let pivotHideTimer: number | null = null;
      let isOrbitingOrPanning = false;
      let activeNavButton: 'orbit' | 'pan' = 'orbit';

      // OrbitControls events
      controls.addEventListener('change', () => {
        orbitPivot.position.set(controls.target.x, 0.03, controls.target.z);
        syncCompassRose();
        requestRender();
      });
      controls.addEventListener('start', () => {
        ctxObj.camGoal = null;
        isOrbitingOrPanning = true;
        if (pivotHideTimer !== null) {
          window.clearTimeout(pivotHideTimer);
          pivotHideTimer = null;
        }
        orbitPivot.position.set(controls.target.x, 0.03, controls.target.z);
        orbitPivot.visible = true;
        floorReticle.visible = false;
        hideHoverTooltip();
        renderer.domElement.style.cursor = activeNavButton === 'pan' ? 'move' : 'grabbing';
        propsRef.current.onUserOrbitStart();
        requestRender();
      });
      controls.addEventListener('end', () => {
        isOrbitingOrPanning = false;
        renderer.domElement.style.cursor = 'grab';
        if (pivotHideTimer !== null) window.clearTimeout(pivotHideTimer);
        pivotHideTimer = window.setTimeout(() => {
          orbitPivot.visible = false;
          requestRender();
        }, 450);
      });

      // Task 5: Double-click object = zoom to object, Double-click empty floor = center room
      const onDblClick = (e: MouseEvent) => {
        updateNdc(e as unknown as PointerEvent);
        _raycaster.setFromCamera(_ndc, camera);
        const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
        const rawHit = getPrioritizedHit(hits, true, propsRef.current.selection);
        const hitRoot =
          rawHit && rawHit.userData.entityKind !== 'zone' ? rawHit : null;
        if (hitRoot) {
          const box = new THREE.Box3().setFromObject(hitRoot);
          const center = new THREE.Vector3();
          box.getCenter(center);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z, 1.5);
          ctxObj.camGoal = {
            pos: new THREE.Vector3(center.x + maxDim * 1.8, center.y + maxDim * 1.5, center.z + maxDim * 1.8),
            target: new THREE.Vector3(center.x, center.y, center.z),
          };
          requestRender();
        } else {
          const currentDist = THREE.MathUtils.clamp(
            camera.position.distanceTo(controls.target),
            1.0,
            80.0,
          );
          const roomCenter = new THREE.Vector3(0, 0.3, 0);
          const offset = camera.position.clone().sub(controls.target);
          if (offset.lengthSq() < 1e-6) {
            offset.set(...CAMERA_PRESETS.center.pos).sub(roomCenter);
          }
          offset.setLength(currentDist);
          ctxObj.camGoal = {
            pos: roomCenter.clone().add(offset),
            target: roomCenter,
          };
          requestRender();
        }
      };
      renderer.domElement.addEventListener('dblclick', onDblClick);

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

      // Pointer interaction: Hover, Click Select, Drag-Move, and Precision Placement
      let downPos: { x: number; y: number } | null = null;
      let hasDragged = false;
      let currentPointerId: number | null = null;
      let dragTarget: {
        kind: 'equipment' | 'zone' | 'opening';
        id: string;
        obj: THREE.Object3D;
        initialX: number;
        initialZ: number;
        initialRotDeg: number;
        offsetX: number;
        offsetZ: number;
        halfW: number;
        halfD: number;
        baseWidth: number;
        baseDepth: number;
        height: number;
        baseY: number;
        rotationDeg: number;
        label: string;
        isColliding: boolean;
        childObjs: {
          id: string;
          obj: THREE.Object3D;
          sprite?: THREE.Sprite;
          initialX: number;
          initialZ: number;
        }[];
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

      // Task 1: Picking priority equipment > opening > zone (zone draggable only if already selected)
      const getPrioritizedHit = (
        hits: THREE.Intersection[],
        allowUnselectedZone: boolean,
        currentSelection: SelectionState | null,
      ): THREE.Object3D | null => {
        let eqRoot: THREE.Object3D | null = null;
        let opRoot: THREE.Object3D | null = null;
        let znRoot: THREE.Object3D | null = null;

        for (const hit of hits) {
          const root = findEntityRoot(hit.object);
          if (!root) continue;
          const kind = root.userData.entityKind;
          if (kind === 'equipment' && !eqRoot) {
            eqRoot = root;
            break;
          } else if (kind === 'opening' && !opRoot) {
            opRoot = root;
          } else if (kind === 'zone' && !znRoot) {
            znRoot = root;
          }
        }

        if (eqRoot) return eqRoot;
        if (opRoot) return opRoot;
        if (znRoot) {
          if (allowUnselectedZone) return znRoot;
          if (
            currentSelection?.kind === 'zone' &&
            currentSelection.id === znRoot.userData.entityId
          ) {
            return znRoot;
          }
        }
        return null;
      };

      // Task 4: cancelDrag reverts positions, restores controls & cleans up
      const cancelDrag = () => {
        if (!dragTarget) return;
        controls.enabled = true;
        dragTarget.obj.position.x = dragTarget.initialX;
        dragTarget.obj.position.z = dragTarget.initialZ;
        if (dragTarget.kind === 'equipment') {
          dragTarget.obj.rotation.y = THREE.MathUtils.degToRad(dragTarget.initialRotDeg);
          dragTarget.rotationDeg = dragTarget.initialRotDeg;
        }
        const attachedSprite = dragTarget.obj.userData?.labelSprite as THREE.Sprite | undefined;
        if (attachedSprite) {
          attachedSprite.position.x = dragTarget.initialX;
          attachedSprite.position.z = dragTarget.initialZ;
        }
        for (const child of dragTarget.childObjs) {
          child.obj.position.x = child.initialX;
          child.obj.position.z = child.initialZ;
          if (child.sprite) {
            child.sprite.position.x = child.initialX;
            child.sprite.position.z = child.initialZ;
          }
        }
        ctxObj.setFootprintColor(false);
        ctxObj.simsFootprint.visible = false;
        ctxObj.selectionHelper.visible = false;
        propsRef.current.onLiveDragCoords(null);
        if (currentPointerId !== null) {
          try {
            renderer.domElement.releasePointerCapture(currentPointerId);
          } catch {
            // ignore
          }
        }
        dragTarget = null;
        downPos = null;
        hasDragged = false;
        currentPointerId = null;
        requestRender();
      };

      // Task 7: R key rotates held item 90° and immediately recomputes footprint & collision
      const handleRotateHeld = () => {
        if (!dragTarget || dragTarget.kind !== 'equipment') return;
        dragTarget.rotationDeg = (dragTarget.rotationDeg + 90) % 360;
        dragTarget.obj.rotation.y = THREE.MathUtils.degToRad(dragTarget.rotationDeg);

        const fp = getFootprint({
          width: dragTarget.baseWidth,
          depth: dragTarget.baseDepth,
          rotationDeg: dragTarget.rotationDeg,
        });
        dragTarget.halfW = fp.halfW;
        dragTarget.halfD = fp.halfD;

        const sc = propsRef.current.scenario;
        const clamped = clampToRoom(
          { x: dragTarget.obj.position.x, z: dragTarget.obj.position.z },
          fp,
          sc.labWidth,
          sc.labDepth,
        );
        const nx = Number(clamped.x.toFixed(2));
        const nz = Number(clamped.z.toFixed(2));
        dragTarget.obj.position.x = nx;
        dragTarget.obj.position.z = nz;

        const attachedSprite = dragTarget.obj.userData?.labelSprite as THREE.Sprite | undefined;
        if (attachedSprite) {
          attachedSprite.position.x = nx;
          attachedSprite.position.z = nz;
        }

        const candidateItem: SpatialBoxInput = {
          id: dragTarget.id,
          x: nx,
          z: nz,
          width: dragTarget.baseWidth,
          depth: dragTarget.baseDepth,
          height: dragTarget.height,
          baseY: dragTarget.baseY,
          rotationDeg: dragTarget.rotationDeg,
        };
        const ignoreIds = new Set<string>([
          dragTarget.id,
          ...dragTarget.childObjs.map((c) => c.id),
        ]);
        const overlaps = findOverlaps(candidateItem, sc.equipment, ignoreIds);
        const isColliding = overlaps.length > 0;
        dragTarget.isColliding = isColliding;

        ctxObj.setFootprintColor(isColliding);
        ctxObj.simsFootprint.position.set(nx, 0.018, nz);
        ctxObj.simsFootprint.rotation.y = THREE.MathUtils.degToRad(-dragTarget.rotationDeg);
        ctxObj.simsFootprint.scale.set(dragTarget.baseWidth, 1, dragTarget.baseDepth);

        propsRef.current.onLiveDragCoords({
          label: dragTarget.isColliding ? `${dragTarget.label} (ชนครุภัณฑ์อื่น)` : dragTarget.label,
        });
        requestRender();
      };

      const onPointerDown = (e: PointerEvent) => {
        activeNavButton = e.button === 1 || e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
        hideHoverTooltip();
        floorReticle.visible = false;
        if (e.button !== 0 || e.shiftKey) {
          renderer.domElement.style.cursor = activeNavButton === 'pan' ? 'move' : 'grabbing';
          return;
        }
        downPos = { x: e.clientX, y: e.clientY };
        hasDragged = false;
        currentPointerId = e.pointerId;
        updateNdc(e);
        _raycaster.setFromCamera(_ndc, camera);

        const currentTool = propsRef.current.tool;
        if (currentTool === 'move') {
          const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
          // Task 1: equipment > opening > zone (zone draggable only if already selected)
          const hitRoot = getPrioritizedHit(hits, false, propsRef.current.selection);
          if (hitRoot && _raycaster.ray.intersectPlane(_groundPlane, _intersectPt)) {
            const sc = propsRef.current.scenario;
            const kind = hitRoot.userData.entityKind as 'equipment' | 'zone' | 'opening';
            const id = hitRoot.userData.entityId as string;
            const eqItem = kind === 'equipment' ? sc.equipment.find((item) => item.id === id) : null;
            const znItem = kind === 'zone' ? sc.zones.find((z) => z.id === id) : null;
            const opItem = kind === 'opening' ? sc.openings.find((o) => o.id === id) : null;

            let halfW = 0.5;
            let halfD = 0.5;
            let baseWidth = 1;
            let baseDepth = 1;
            let height = 0.5;
            let baseY = 0;
            let rotationDeg = 0;
            let label = (hitRoot.userData.label as string) ?? id;

            if (eqItem) {
              const fp = getFootprint(eqItem);
              halfW = fp.halfW;
              halfD = fp.halfD;
              baseWidth = eqItem.width;
              baseDepth = eqItem.depth;
              height = eqItem.height;
              baseY = eqItem.baseY;
              rotationDeg = eqItem.rotationDeg;
              label = eqItem.labelTh;
            } else if (znItem) {
              halfW = znItem.width / 2;
              halfD = znItem.depth / 2;
              baseWidth = znItem.width;
              baseDepth = znItem.depth;
              label = znItem.nameTh;
            } else if (opItem) {
              halfW = Math.max(0.2, opItem.width / 2);
              halfD = Math.max(0.2, opItem.depth / 2);
              baseWidth = opItem.width;
              baseDepth = opItem.depth;
              label = opItem.labelTh;
            }

            // Task 9: find elevated machines sitting on top of this equipment
            const childObjs: {
              id: string;
              obj: THREE.Object3D;
              sprite?: THREE.Sprite;
              initialX: number;
              initialZ: number;
            }[] = [];

            if (eqItem) {
              const parentAabb = getItemAABB(eqItem);
              const machinesOnTop = sc.equipment.filter(
                (other) =>
                  other.id !== eqItem.id &&
                  other.baseY > 0 &&
                  other.x >= parentAabb.minX &&
                  other.x <= parentAabb.maxX &&
                  other.z >= parentAabb.minZ &&
                  other.z <= parentAabb.maxZ &&
                  other.baseY >= eqItem.baseY + eqItem.height * 0.7,
              );
              for (const m of machinesOnTop) {
                const mObj = ctxObj.entityMap.get(`equipment:${m.id}`);
                if (mObj) {
                  childObjs.push({
                    id: m.id,
                    obj: mObj,
                    sprite: mObj.userData?.labelSprite as THREE.Sprite | undefined,
                    initialX: mObj.position.x,
                    initialZ: mObj.position.z,
                  });
                }
              }
            }

            dragTarget = {
              kind,
              id,
              obj: hitRoot,
              initialX: hitRoot.position.x,
              initialZ: hitRoot.position.z,
              initialRotDeg: rotationDeg,
              offsetX: hitRoot.position.x - _intersectPt.x,
              offsetZ: hitRoot.position.z - _intersectPt.z,
              halfW,
              halfD,
              baseWidth,
              baseDepth,
              height,
              baseY,
              rotationDeg,
              label,
              isColliding: false,
              childObjs,
            };
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        updateNdc(e);

        if (dragTarget && downPos) {
          const pointerDist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
          // Task 3: must move > 5px to be considered a drag
          if (!hasDragged) {
            if (pointerDist > 5) {
              hasDragged = true;
              controls.enabled = false;
              propsRef.current.onSelect({ kind: dragTarget.kind, id: dragTarget.id });
              try {
                renderer.domElement.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
            } else {
              return;
            }
          }

          _raycaster.setFromCamera(_ndc, camera);
          if (_raycaster.ray.intersectPlane(_groundPlane, _intersectPt)) {
            const sc = propsRef.current.scenario;
            const rawX = _intersectPt.x + dragTarget.offsetX;
            const rawZ = _intersectPt.z + dragTarget.offsetZ;

            // Task 6: single 0.1m snap grid, Alt key disables snap
            const useSnap = !e.altKey;
            const targetX = useSnap ? snapToGrid(rawX, 0.1) : rawX;
            const targetZ = useSnap ? snapToGrid(rawZ, 0.1) : rawZ;

            // Task 5: getFootprint + clampToRoom
            const fp = { halfW: dragTarget.halfW, halfD: dragTarget.halfD };
            const clamped = clampToRoom({ x: targetX, z: targetZ }, fp, sc.labWidth, sc.labDepth);
            const nx = Number(clamped.x.toFixed(2));
            const nz = Number(clamped.z.toFixed(2));

            const dx = nx - dragTarget.initialX;
            const dz = nz - dragTarget.initialZ;

            dragTarget.obj.position.x = nx;
            dragTarget.obj.position.z = nz;
            const attachedSprite = dragTarget.obj.userData?.labelSprite as THREE.Sprite | undefined;
            if (attachedSprite) {
              attachedSprite.position.x = nx;
              attachedSprite.position.z = nz;
            }

            // Task 9: Move machines on top of table
            for (const child of dragTarget.childObjs) {
              child.obj.position.x = Number((child.initialX + dx).toFixed(2));
              child.obj.position.z = Number((child.initialZ + dz).toFixed(2));
              if (child.sprite) {
                child.sprite.position.x = child.obj.position.x;
                child.sprite.position.z = child.obj.position.z;
              }
            }

            ctxObj.selectionHelper.box.setFromObject(dragTarget.obj);
            ctxObj.selectionHelper.visible = true;

            // Task 8: findOverlaps collision check while dragging
            let isColliding = false;
            if (dragTarget.kind === 'equipment') {
              const candidateItem: SpatialBoxInput = {
                id: dragTarget.id,
                x: nx,
                z: nz,
                width: dragTarget.baseWidth,
                depth: dragTarget.baseDepth,
                height: dragTarget.height,
                baseY: dragTarget.baseY,
                rotationDeg: dragTarget.rotationDeg,
              };
              const ignoreIds = new Set<string>([
                dragTarget.id,
                ...dragTarget.childObjs.map((c) => c.id),
              ]);
              const overlaps = findOverlaps(candidateItem, sc.equipment, ignoreIds);
              isColliding = overlaps.length > 0;
            }
            dragTarget.isColliding = isColliding;

            ctxObj.setFootprintColor(isColliding);
            ctxObj.simsFootprint.position.set(nx, 0.018, nz);
            ctxObj.simsFootprint.rotation.y = THREE.MathUtils.degToRad(-dragTarget.rotationDeg);
            ctxObj.simsFootprint.scale.set(dragTarget.baseWidth, 1, dragTarget.baseDepth);
            ctxObj.simsFootprint.visible = true;

            propsRef.current.onLiveDragCoords({
              label: dragTarget.isColliding ? `${dragTarget.label} (ชนครุภัณฑ์อื่น)` : dragTarget.label,
            });
            requestRender();
          }
          return;
        }

        // While actively orbiting/panning with OrbitControls, keep cursor & skip hover raycasts
        if (isOrbitingOrPanning || (e.buttons !== 0 && !dragTarget)) {
          const isPanActive = e.buttons === 2 || e.buttons === 4 || e.shiftKey;
          renderer.domElement.style.cursor = isPanActive ? 'move' : 'grabbing';
          floorReticle.visible = false;
          hideHoverTooltip();
          return;
        }

        // Desktop floor reticle tracking + throttled hover raycast (~22fps)
        const now = performance.now();
        if (now - lastHoverCheck < 45) return;
        lastHoverCheck = now;

        _raycaster.setFromCamera(_ndc, camera);

        if (e.pointerType !== 'touch' && _raycaster.ray.intersectPlane(_groundPlane, _intersectPt)) {
          const sc = propsRef.current.scenario;
          const withinRoom =
            Math.abs(_intersectPt.x) <= sc.labWidth / 2 + 2.5 &&
            Math.abs(_intersectPt.z) <= sc.labDepth / 2 + 2.5;
          if (withinRoom) {
            floorReticle.position.set(_intersectPt.x, 0.025, _intersectPt.z);
            floorReticle.visible = true;
          } else {
            floorReticle.visible = false;
          }
        } else {
          floorReticle.visible = false;
        }

        const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
        const hitRoot = getPrioritizedHit(hits, propsRef.current.tool !== 'move', propsRef.current.selection);
        const tooltipHit = hitRoot ?? getPrioritizedHit(hits, true, propsRef.current.selection);

        if (hitRoot) {
          const isZone = hitRoot.userData.entityKind === 'zone';
          const isSelectedZone =
            isZone &&
            propsRef.current.selection?.kind === 'zone' &&
            propsRef.current.selection.id === hitRoot.userData.entityId;

          if (propsRef.current.tool === 'move') {
            renderer.domElement.style.cursor = !isZone || isSelectedZone ? 'grab' : 'grab';
          } else {
            renderer.domElement.style.cursor = 'pointer';
          }
          ctxObj.hoverHelper.box.setFromObject(hitRoot);
          ctxObj.hoverHelper.visible = !isZone || isSelectedZone || propsRef.current.tool !== 'move';
        } else {
          renderer.domElement.style.cursor = e.shiftKey ? 'move' : 'grab';
          ctxObj.hoverHelper.visible = false;
        }

        if (e.pointerType !== 'touch' && tooltipHit && hoverTooltipRef.current && hoverTitleRef.current && hoverHintRef.current) {
          const label = (tooltipHit.userData.label as string) || '';
          const kind = tooltipHit.userData.entityKind as 'equipment' | 'zone' | 'opening';
          hoverTitleRef.current.textContent = label;
          hoverHintRef.current.textContent =
            kind === 'zone'
              ? 'คลิกเลือกโซน · ลากซ้ายหมุนมุม · ลากขวาเลื่อน'
              : propsRef.current.tool === 'move'
                ? 'คลิกเลือก · ลากย้ายตำแหน่ง · กด R หมุน'
                : 'คลิกดูรายละเอียด · ดับเบิลคลิกซูมใกล้';
          const tipX = Math.min(e.clientX + 16, window.innerWidth - 230);
          const tipY = Math.min(e.clientY + 18, window.innerHeight - 68);
          hoverTooltipRef.current.style.transform = `translate3d(${tipX}px, ${tipY}px, 0)`;
          hoverTooltipRef.current.style.opacity = '1';
        } else {
          hideHoverTooltip();
        }
        requestRender();
      };

      const onPointerUp = (e: PointerEvent) => {
        if (dragTarget) {
          const {
            kind,
            id,
            obj,
            initialX,
            initialZ,
            initialRotDeg,
            rotationDeg,
            isColliding,
            childObjs,
          } = dragTarget;
          controls.enabled = true;
          try {
            renderer.domElement.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }

          // Task 3: Released before moving > 5px -> Click only, do not commit move
          if (!hasDragged) {
            dragTarget = null;
            downPos = null;
            hasDragged = false;
            currentPointerId = null;
            propsRef.current.onLiveDragCoords(null);
            ctxObj.simsFootprint.visible = false;
            propsRef.current.onSelect({ kind, id });
            requestRender();
            return;
          }

          propsRef.current.onLiveDragCoords(null);

          // Task 8: If colliding (red) -> Bounce back to initial position + toast
          if (isColliding) {
            obj.position.x = initialX;
            obj.position.z = initialZ;
            if (kind === 'equipment') {
              obj.rotation.y = THREE.MathUtils.degToRad(initialRotDeg);
            }
            const attachedSprite = obj.userData?.labelSprite as THREE.Sprite | undefined;
            if (attachedSprite) {
              attachedSprite.position.x = initialX;
              attachedSprite.position.z = initialZ;
            }
            for (const child of childObjs) {
              child.obj.position.x = child.initialX;
              child.obj.position.z = child.initialZ;
              if (child.sprite) {
                child.sprite.position.x = child.initialX;
                child.sprite.position.z = child.initialZ;
              }
            }
            ctxObj.setFootprintColor(false);
            ctxObj.simsFootprint.visible = false;
            ctxObj.selectionHelper.visible = false;
            dragTarget = null;
            downPos = null;
            hasDragged = false;
            currentPointerId = null;
            propsRef.current.onNotice?.('วางไม่สำเร็จ: ตำแหน่งชนกับครุภัณฑ์อื่น');
            requestRender();
            return;
          }

          // Task 3: If returned to exact same place, do not commit move
          const finalX = Number(obj.position.x.toFixed(2));
          const finalZ = Number(obj.position.z.toFixed(2));
          const finalRot = rotationDeg;
          const returnedSame =
            Math.abs(finalX - initialX) < 0.001 &&
            Math.abs(finalZ - initialZ) < 0.001 &&
            finalRot === initialRotDeg;

          dragTarget = null;
          downPos = null;
          hasDragged = false;
          currentPointerId = null;
          ctxObj.setFootprintColor(false);

          if (!returnedSame) {
            ctxObj.simsFootprint.position.set(finalX, 0.018, finalZ);
            propsRef.current.onCommitMove(kind, id, finalX, finalZ, finalRot);
          } else {
            ctxObj.simsFootprint.visible = false;
          }
          requestRender();
          return;
        }

        if (!downPos) return;
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        downPos = null;
        if (moved > 5) return; // Orbit drag

        updateNdc(e);
        _raycaster.setFromCamera(_ndc, camera);

        const hits = _raycaster.intersectObjects(ctxObj.clickableRoots, true);
        const hitRoot = getPrioritizedHit(hits, true, propsRef.current.selection);

        // Task 2: Tap-to-Place removed entirely. Click on empty space = deselect only.
        if (hitRoot) {
          propsRef.current.onSelect({
            kind: hitRoot.userData.entityKind,
            id: hitRoot.userData.entityId,
          });
        } else {
          propsRef.current.onSelect(null);
        }
      };

      // Task 4: pointercancel and lostpointercapture handlers
      const onPointerCancel = () => {
        cancelDrag();
      };
      const onLostPointerCapture = () => {
        if (dragTarget && hasDragged) {
          cancelDrag();
        }
      };

      const onPointerLeave = () => {
        floorReticle.visible = false;
        ctxObj.hoverHelper.visible = false;
        hideHoverTooltip();
        renderer.domElement.style.cursor = 'default';
        requestRender();
      };

      // Task 4 & 7: Esc to cancel drag, R to rotate held equipment 90°, plus desktop Arrow-key navigation
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (dragTarget) {
            e.preventDefault();
            e.stopPropagation();
            cancelDrag();
            return;
          }
        }
        const target = e.target as HTMLElement | null;
        const inInput =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.tagName === 'SELECT';
        if (inInput) return;

        if ((e.key === 'r' || e.key === 'R') && dragTarget && dragTarget.kind === 'equipment') {
          e.preventDefault();
          e.stopPropagation();
          handleRotateHeld();
          return;
        }

        if (dragTarget) return;

        // Desktop keyboard Google Earth-style navigation (Arrows = pan, Shift+Arrows = orbit/tilt)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const baseTarget = ctxObj.camGoal ? ctxObj.camGoal.target.clone() : controls.target.clone();
          const basePos = ctxObj.camGoal ? ctxObj.camGoal.pos.clone() : camera.position.clone();
          const offset = basePos.clone().sub(baseTarget);

          if (e.shiftKey) {
            const spherical = new THREE.Spherical().setFromVector3(offset);
            const azStep = THREE.MathUtils.degToRad(14);
            const polarStep = THREE.MathUtils.degToRad(9);
            if (e.key === 'ArrowLeft') spherical.theta += azStep;
            if (e.key === 'ArrowRight') spherical.theta -= azStep;
            if (e.key === 'ArrowUp') spherical.phi = Math.max(0.06, spherical.phi - polarStep);
            if (e.key === 'ArrowDown') spherical.phi = Math.min(Math.PI * 0.47, spherical.phi + polarStep);
            offset.setFromSpherical(spherical);
            ctxObj.camGoal = { pos: baseTarget.clone().add(offset), target: baseTarget };
          } else {
            const forward = new THREE.Vector3(baseTarget.x - basePos.x, 0, baseTarget.z - basePos.z);
            if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
            forward.normalize();
            const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
            const panStep = Math.max(0.6, Math.min(2.2, offset.length() * 0.08));
            const moveVec = new THREE.Vector3();
            if (e.key === 'ArrowUp') moveVec.addScaledVector(forward, panStep);
            if (e.key === 'ArrowDown') moveVec.addScaledVector(forward, -panStep);
            if (e.key === 'ArrowRight') moveVec.addScaledVector(right, panStep);
            if (e.key === 'ArrowLeft') moveVec.addScaledVector(right, -panStep);
            ctxObj.camGoal = {
              pos: basePos.clone().add(moveVec),
              target: baseTarget.clone().add(moveVec),
            };
          }
          requestRender();
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointercancel', onPointerCancel);
      renderer.domElement.addEventListener('lostpointercapture', onLostPointerCapture);
      renderer.domElement.addEventListener('pointerleave', onPointerLeave);
      window.addEventListener('keydown', onKeyDown);

      requestRender();

      return () => {
        disposed = true;
        if (pivotHideTimer !== null) window.clearTimeout(pivotHideTimer);
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObs.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
        renderer.domElement.removeEventListener('lostpointercapture', onLostPointerCapture);
        renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
        renderer.domElement.removeEventListener('dblclick', onDblClick);
        window.removeEventListener('keydown', onKeyDown);
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
      ctx.scene.fog = new THREE.Fog(bgHex, 65, 165);
      ctx.requestRender();
    }, [props.isDark]);

    // Trigger camera preset smooth transitions (preserve current zoom distance)
    useEffect(() => {
      const ctx = sceneCtxRef.current;
      if (!ctx || props.cameraPresetTick === 0) return;
      const p = CAMERA_PRESETS[props.cameraPreset];
      if (props.cameraPreset === 'reset') {
        ctx.camGoal = {
          pos: new THREE.Vector3(...p.pos),
          target: new THREE.Vector3(...p.target),
        };
        ctx.requestRender();
        return;
      }
      const currentDist = THREE.MathUtils.clamp(
        ctx.camera.position.distanceTo(ctx.controls.target),
        1.0,
        80.0,
      );
      const goalTarget = new THREE.Vector3(...p.target);
      if (props.cameraPreset === 'center') {
        const currentOffset = ctx.camera.position.clone().sub(ctx.controls.target);
        if (currentOffset.lengthSq() < 1e-6) {
          currentOffset.set(...p.pos).sub(goalTarget);
        }
        currentOffset.setLength(currentDist);
        ctx.camGoal = {
          pos: goalTarget.clone().add(currentOffset),
          target: goalTarget,
        };
      } else {
        const dir = new THREE.Vector3(...p.pos).sub(goalTarget).normalize();
        ctx.camGoal = {
          pos: goalTarget.clone().addScaledVector(dir, currentDist),
          target: goalTarget,
        };
      }
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
      if (ENABLE_COMPLIANCE_ANALYSIS && props.showCrossings) {
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

    const handleZoomStep = (factor: number) => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const target = ctx.camGoal ? ctx.camGoal.target.clone() : ctx.controls.target.clone();
      const pos = ctx.camGoal ? ctx.camGoal.pos.clone() : ctx.camera.position.clone();
      const offset = pos.sub(target);
      if (offset.lengthSq() < 1e-6) {
        offset.set(...CAMERA_PRESETS.iso.pos).sub(new THREE.Vector3(...CAMERA_PRESETS.iso.target));
      }
      const nextDist = THREE.MathUtils.clamp(
        offset.length() * factor,
        ctx.controls.minDistance,
        ctx.controls.maxDistance,
      );
      offset.setLength(nextDist);
      ctx.camGoal = {
        pos: target.clone().add(offset),
        target,
      };
      ctx.requestRender();
    };

    const handleFitRoom = () => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const roomCenter = new THREE.Vector3(0, 0.3, 0);
      const basePos = ctx.camGoal ? ctx.camGoal.pos : ctx.camera.position;
      const baseTarget = ctx.camGoal ? ctx.camGoal.target : ctx.controls.target;
      const dir = basePos.clone().sub(baseTarget);
      if (dir.lengthSq() < 1e-6) {
        dir.set(...CAMERA_PRESETS.iso.pos).sub(roomCenter);
      }
      dir.normalize();

      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      else right.normalize();
      const up = new THREE.Vector3().crossVectors(dir, right).normalize();

      const halfW = propsRef.current.scenario.labWidth / 2;
      const halfD = propsRef.current.scenario.labDepth / 2;
      let maxProjX = 0;
      let maxProjY = 0;
      let maxDepthOffset = 0;
      for (const sx of [-halfW, halfW]) {
        for (const sz of [-halfD, halfD]) {
          for (const sy of [0, 2.2]) {
            const p = new THREE.Vector3(sx, sy - roomCenter.y, sz);
            maxProjX = Math.max(maxProjX, Math.abs(p.dot(right)));
            maxProjY = Math.max(maxProjY, Math.abs(p.dot(up)));
            maxDepthOffset = Math.max(maxDepthOffset, p.dot(dir));
          }
        }
      }

      const vFov = THREE.MathUtils.degToRad(ctx.camera.fov) / 2;
      const hFov = Math.atan(Math.tan(vFov) * Math.max(0.4, ctx.camera.aspect));
      const fitMargin = 1.15;
      const distForV = (maxProjY * fitMargin) / Math.tan(vFov) + maxDepthOffset;
      const distForH = (maxProjX * fitMargin) / Math.tan(hFov) + maxDepthOffset;
      const fitDist = THREE.MathUtils.clamp(
        Math.max(distForV, distForH),
        ctx.controls.minDistance,
        ctx.controls.maxDistance,
      );

      ctx.camGoal = {
        pos: roomCenter.clone().add(dir.multiplyScalar(fitDist)),
        target: roomCenter,
      };
      ctx.requestRender();
    };

    const handleResetNorth = () => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const target = ctx.camGoal ? ctx.camGoal.target.clone() : ctx.controls.target.clone();
      const pos = ctx.camGoal ? ctx.camGoal.pos.clone() : ctx.camera.position.clone();
      const offset = pos.sub(target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta = 0;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.06, Math.PI * 0.47);
      offset.setFromSpherical(spherical);
      ctx.camGoal = {
        pos: target.clone().add(offset),
        target,
      };
      ctx.requestRender();
    };

    const handleToggleTilt = () => {
      const ctx = sceneCtxRef.current;
      if (!ctx) return;
      const target = ctx.camGoal ? ctx.camGoal.target.clone() : ctx.controls.target.clone();
      const pos = ctx.camGoal ? ctx.camGoal.pos.clone() : ctx.camera.position.clone();
      const offset = pos.sub(target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      // Toggle between steep top-down view and angled 3D perspective preserving azimuth & distance
      const isCurrentlyTopDown = spherical.phi < 0.35;
      spherical.phi = isCurrentlyTopDown ? 0.92 : 0.08;
      offset.setFromSpherical(spherical);
      ctx.camGoal = {
        pos: target.clone().add(offset),
        target,
      };
      ctx.requestRender();
    };

    return (
      <div className="relative h-full w-full overflow-hidden">
        <div
          ref={mountRef}
          className="h-full w-full"
          aria-label="โมเดล 3 มิติ Digital Twin ห้องแลปกลาง"
        />

        {/* Desktop Hover Tooltip (follows pointermove cleanly without re-renders) */}
        <div
          ref={hoverTooltipRef}
          aria-hidden="true"
          style={{ opacity: 0, transform: 'translate3d(-999px, -999px, 0)' }}
          className="pointer-events-none fixed left-0 top-0 z-30 hidden sm:block max-w-[240px] rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm transition-opacity duration-100 dark:border-slate-700 dark:bg-slate-900/95"
        >
          <div ref={hoverTitleRef} className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100" />
          <div ref={hoverHintRef} className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400" />
        </div>

        {/* Desktop Mouse & Keyboard Hint (bottom-center on wide desktop screens) */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 hidden lg:flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300">
          <span>ลากซ้าย: หมุนมุม</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>ลากขวา / Shift+ลาก: เลื่อน</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>ล้อเมาส์: ซูม</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>ปุ่มลูกศร: เดินกล้อง</span>
        </div>

        {/* Bottom-right Google Earth-style Angle/Compass + Zoom Controls */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute bottom-2 right-3 sm:bottom-4 sm:right-4 z-10 flex items-center gap-2"
        >
          {/* Compass & Tilt Control */}
          <div
            role="group"
            aria-label="เข็มทิศและมุมเอียงกล้อง"
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
          >
            <button
              type="button"
              onClick={handleResetNorth}
              title="เข็มทิศ (คลิกเพื่อหันหน้ากลับทิศมาตรฐาน)"
              aria-label="เข็มทิศ หันกลับทิศมาตรฐาน"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
            >
              <span
                ref={compassDialRef}
                className="flex h-7 w-7 items-center justify-center will-change-transform"
              >
                <svg viewBox="0 0 28 28" className="h-6 w-6" aria-hidden="true">
                  <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.2" />
                  <polygon points="14,3 17.5,14 14,12 10.5,14" fill="#ef4444" />
                  <polygon points="14,25 17.5,14 14,16 10.5,14" fill="currentColor" fillOpacity="0.35" />
                  <circle cx="14" cy="14" r="1.6" fill="currentColor" />
                </svg>
              </span>
            </button>
            <button
              type="button"
              onClick={handleToggleTilt}
              title="สลับมุมเอียง 3 มิติ / มองจากด้านบน"
              aria-label="สลับมุมเอียง 3 มิติ"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3 3 8l9 5 9-5-9-5z" />
                <path d="m3 14 9 5 9-5" />
              </svg>
            </button>
          </div>

          {/* Zoom & Fit Controls (shared appearance & position with 2D) */}
          <div
            role="group"
            aria-label="ควบคุมการซูมมุมมอง"
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
          >
            <button
              type="button"
              onClick={() => handleZoomStep(0.8)}
              title="ซูมเข้า (+)"
              aria-label="ซูมเข้า (+)"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleZoomStep(1.25)}
              title="ซูมออก (−)"
              aria-label="ซูมออก (−)"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={handleFitRoom}
              title="จัดผังพอดีจอ (ดับเบิลคลิกบนพื้นว่าง)"
              className="flex h-11 min-w-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
            >
              <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>พอดีจอ</span>
            </button>
          </div>
        </div>

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

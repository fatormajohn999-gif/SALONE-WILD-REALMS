import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Scalar } from '@babylonjs/core/Maths/math.scalar';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { CharacterMovementState } from '../types';

export class ExplorerCharacter {
  public readonly root: TransformNode;
  private readonly visualRoot: TransformNode;
  private readonly bodyPivot: TransformNode;
  private readonly headPivot: TransformNode;
  private readonly leftShoulder: TransformNode;
  private readonly rightShoulder: TransformNode;
  private readonly leftElbow: TransformNode;
  private readonly rightElbow: TransformNode;
  private readonly leftHip: TransformNode;
  private readonly rightHip: TransformNode;
  private readonly leftKnee: TransformNode;
  private readonly rightKnee: TransformNode;
  private readonly leftAnkle: TransformNode;
  private readonly rightAnkle: TransformNode;
  private readonly meshes: AbstractMesh[] = [];

  private animTime = 0;
  private currentStrideBlend = 0;
  private currentLean = 0;
  private currentJumpBlend = 0;

  constructor(
    scene: Scene,
    registerShadowCaster?: (mesh: AbstractMesh) => void
  ) {
    this.root = new TransformNode('explorerRoot', scene);
    this.visualRoot = new TransformNode('explorerVisualRoot', scene);
    this.visualRoot.parent = this.root;

    this.bodyPivot = new TransformNode('explorerBodyPivot', scene);
    this.bodyPivot.parent = this.visualRoot;
    this.bodyPivot.position.y = 0.86;

    // Stylized realistic earthy explorer materials
    const tunicMat = new StandardMaterial('explorerTunicMat', scene);
    tunicMat.diffuseColor = new Color3(0.13, 0.34, 0.23);
    tunicMat.specularColor = new Color3(0.08, 0.1, 0.08);

    const collarMat = new StandardMaterial('explorerCollarMat', scene);
    collarMat.diffuseColor = new Color3(0.19, 0.42, 0.29);
    collarMat.specularColor = new Color3(0.06, 0.08, 0.06);

    const trouserMat = new StandardMaterial('explorerTrouserMat', scene);
    trouserMat.diffuseColor = new Color3(0.17, 0.21, 0.19);
    trouserMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const leatherMat = new StandardMaterial('explorerLeatherMat', scene);
    leatherMat.diffuseColor = new Color3(0.32, 0.21, 0.14);
    leatherMat.specularColor = new Color3(0.14, 0.11, 0.08);

    const soleMat = new StandardMaterial('explorerSoleMat', scene);
    soleMat.diffuseColor = new Color3(0.12, 0.1, 0.09);
    soleMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const packMat = new StandardMaterial('explorerPackMat', scene);
    packMat.diffuseColor = new Color3(0.54, 0.44, 0.3);
    packMat.specularColor = new Color3(0.06, 0.05, 0.04);

    const bedrollMat = new StandardMaterial('explorerBedrollMat', scene);
    bedrollMat.diffuseColor = new Color3(0.32, 0.43, 0.35);
    bedrollMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const brassMat = new StandardMaterial('explorerBrassMat', scene);
    brassMat.diffuseColor = new Color3(0.78, 0.66, 0.41);
    brassMat.specularColor = new Color3(0.35, 0.3, 0.2);

    const skinMat = new StandardMaterial('explorerSkinMat', scene);
    skinMat.diffuseColor = new Color3(0.68, 0.47, 0.34);
    skinMat.specularColor = new Color3(0.09, 0.07, 0.05);

    const eyeMat = new StandardMaterial('explorerEyeMat', scene);
    eyeMat.diffuseColor = new Color3(0.1, 0.09, 0.08);
    eyeMat.specularColor = new Color3(0.3, 0.3, 0.3);

    const hatMat = new StandardMaterial('explorerHatMat', scene);
    hatMat.diffuseColor = new Color3(0.42, 0.36, 0.25);
    hatMat.specularColor = new Color3(0.07, 0.06, 0.05);

    const trackMesh = <T extends AbstractMesh>(mesh: T): T => {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.meshes.push(mesh);
      registerShadowCaster?.(mesh);
      return mesh;
    };

    // --- Pelvis & Contoured Torso ---
    const pelvis = trackMesh(
      MeshBuilder.CreateSphere('explorerPelvis', { diameter: 0.34, segments: 12 }, scene)
    );
    pelvis.parent = this.bodyPivot;
    pelvis.position.y = 0.02;
    pelvis.scaling.set(1.08, 0.72, 0.72);
    pelvis.material = trouserMat;

    const torso = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerTorso',
        { height: 0.45, diameterBottom: 0.34, diameterTop: 0.42, tessellation: 14 },
        scene
      )
    );
    torso.parent = this.bodyPivot;
    torso.position.y = 0.28;
    torso.scaling.set(1.06, 1.0, 0.66);
    torso.material = tunicMat;

    const chestYoke = trackMesh(
      MeshBuilder.CreateSphere('explorerChestYoke', { diameter: 0.42, segments: 12 }, scene)
    );
    chestYoke.parent = this.bodyPivot;
    chestYoke.position.y = 0.47;
    chestYoke.scaling.set(1.12, 0.42, 0.72);
    chestYoke.material = tunicMat;

    const collar = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerCollar',
        { height: 0.07, diameterBottom: 0.2, diameterTop: 0.16, tessellation: 12 },
        scene
      )
    );
    collar.parent = this.bodyPivot;
    collar.position.y = 0.54;
    collar.material = collarMat;

    const belt = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerBelt',
        { height: 0.07, diameter: 0.36, tessellation: 14 },
        scene
      )
    );
    belt.parent = this.bodyPivot;
    belt.position.y = 0.08;
    belt.scaling.set(1.07, 1.0, 0.69);
    belt.material = leatherMat;

    const buckle = trackMesh(
      MeshBuilder.CreateBox(
        'explorerBuckle',
        { width: 0.085, height: 0.065, depth: 0.025 },
        scene
      )
    );
    buckle.parent = this.bodyPivot;
    buckle.position.set(0, 0.08, 0.128);
    buckle.material = brassMat;

    // --- Explorer Backpack + Shoulder Straps ---
    const backpack = trackMesh(
      MeshBuilder.CreateBox(
        'explorerBackpack',
        { width: 0.33, height: 0.4, depth: 0.17 },
        scene
      )
    );
    backpack.parent = this.bodyPivot;
    backpack.position.set(0, 0.31, -0.2);
    backpack.material = packMat;

    const packFlap = trackMesh(
      MeshBuilder.CreateSphere('explorerPackFlap', { diameter: 0.32, segments: 10 }, scene)
    );
    packFlap.parent = this.bodyPivot;
    packFlap.position.set(0, 0.47, -0.2);
    packFlap.scaling.set(1.04, 0.35, 0.56);
    packFlap.material = packMat;

    const bedroll = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerBedroll',
        { height: 0.38, diameter: 0.13, tessellation: 10 },
        scene
      )
    );
    bedroll.parent = this.bodyPivot;
    bedroll.position.set(0, 0.56, -0.19);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.material = bedrollMat;

    for (const side of [-1, 1]) {
      const strapFront = trackMesh(
        MeshBuilder.CreateBox(
          `explorerStrap_${side > 0 ? 'R' : 'L'}`,
          { width: 0.055, height: 0.36, depth: 0.27 },
          scene
        )
      );
      strapFront.parent = this.bodyPivot;
      strapFront.position.set(side * 0.12, 0.37, -0.02);
      strapFront.material = leatherMat;
    }

    // --- Neck, Sculpted Head, & Wide-Brim Explorer Hat ---
    const neck = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerNeck',
        { height: 0.11, diameterBottom: 0.115, diameterTop: 0.1, tessellation: 10 },
        scene
      )
    );
    neck.parent = this.bodyPivot;
    neck.position.y = 0.59;
    neck.material = skinMat;

    this.headPivot = new TransformNode('explorerHeadPivot', scene);
    this.headPivot.parent = this.bodyPivot;
    this.headPivot.position.y = 0.62;

    const head = trackMesh(
      MeshBuilder.CreateSphere('explorerHead', { diameter: 0.28, segments: 14 }, scene)
    );
    head.parent = this.headPivot;
    head.position.set(0, 0.15, 0.01);
    head.scaling.set(0.92, 1.05, 0.98);
    head.material = skinMat;

    const nose = trackMesh(
      MeshBuilder.CreateSphere('explorerNose', { diameter: 0.045, segments: 6 }, scene)
    );
    nose.parent = this.headPivot;
    nose.position.set(0, 0.145, 0.142);
    nose.scaling.set(0.8, 1.0, 1.1);
    nose.material = skinMat;

    for (const side of [-1, 1]) {
      const eye = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerEye_${side > 0 ? 'R' : 'L'}`,
          { diameter: 0.026, segments: 6 },
          scene
        )
      );
      eye.parent = this.headPivot;
      eye.position.set(side * 0.048, 0.168, 0.128);
      eye.material = eyeMat;
    }

    const hatCrown = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerHatCrown',
        { height: 0.12, diameterTop: 0.23, diameterBottom: 0.285, tessellation: 14 },
        scene
      )
    );
    hatCrown.parent = this.headPivot;
    hatCrown.position.set(0, 0.27, 0);
    hatCrown.material = hatMat;

    const hatBand = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerHatBand',
        { height: 0.028, diameter: 0.292, tessellation: 14 },
        scene
      )
    );
    hatBand.parent = this.headPivot;
    hatBand.position.set(0, 0.228, 0);
    hatBand.material = leatherMat;

    const hatBrim = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerHatBrim',
        { height: 0.02, diameter: 0.45, tessellation: 16 },
        scene
      )
    );
    hatBrim.parent = this.headPivot;
    hatBrim.position.set(0, 0.215, 0.015);
    hatBrim.scaling.set(0.96, 1.0, 1.08);
    hatBrim.rotation.x = 0.06;
    hatBrim.material = hatMat;

    // --- Two-Segment Articulated Arms (Shoulder -> Elbow -> Forearm & Hand) ---
    this.leftShoulder = new TransformNode('explorerLeftShoulder', scene);
    this.leftShoulder.parent = this.bodyPivot;
    this.leftShoulder.position.set(-0.245, 0.47, 0);

    this.rightShoulder = new TransformNode('explorerRightShoulder', scene);
    this.rightShoulder.parent = this.bodyPivot;
    this.rightShoulder.position.set(0.245, 0.47, 0);

    const buildArm = (shoulderPivot: TransformNode, side: string): TransformNode => {
      const shoulderCap = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerShoulderCap_${side}`,
          { diameter: 0.135, segments: 10 },
          scene
        )
      );
      shoulderCap.parent = shoulderPivot;
      shoulderCap.material = tunicMat;

      const upperArm = trackMesh(
        MeshBuilder.CreateCylinder(
          `explorerUpperArm_${side}`,
          { height: 0.24, diameterTop: 0.122, diameterBottom: 0.102, tessellation: 10 },
          scene
        )
      );
      upperArm.parent = shoulderPivot;
      upperArm.position.y = -0.12;
      upperArm.material = tunicMat;

      const elbowPivot = new TransformNode(`explorerElbow_${side}`, scene);
      elbowPivot.parent = shoulderPivot;
      elbowPivot.position.y = -0.24;

      const elbowJoint = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerElbowJoint_${side}`,
          { diameter: 0.098, segments: 8 },
          scene
        )
      );
      elbowJoint.parent = elbowPivot;
      elbowJoint.material = skinMat;

      const forearm = trackMesh(
        MeshBuilder.CreateCylinder(
          `explorerForearm_${side}`,
          { height: 0.22, diameterTop: 0.096, diameterBottom: 0.076, tessellation: 10 },
          scene
        )
      );
      forearm.parent = elbowPivot;
      forearm.position.y = -0.11;
      forearm.material = skinMat;

      const hand = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerHand_${side}`,
          { diameter: 0.092, segments: 8 },
          scene
        )
      );
      hand.parent = elbowPivot;
      hand.position.set(0, -0.23, 0.01);
      hand.scaling.set(0.85, 1.15, 0.95);
      hand.material = skinMat;

      return elbowPivot;
    };

    this.leftElbow = buildArm(this.leftShoulder, 'L');
    this.rightElbow = buildArm(this.rightShoulder, 'R');

    // --- Two-Segment Articulated Legs (Hip 0.86 -> Knee 0.48 -> Ankle 0.11 -> Boot Sole 0.000) ---
    this.leftHip = new TransformNode('explorerLeftHip', scene);
    this.leftHip.parent = this.visualRoot;
    this.leftHip.position.set(-0.105, 0.86, 0);

    this.rightHip = new TransformNode('explorerRightHip', scene);
    this.rightHip.parent = this.visualRoot;
    this.rightHip.position.set(0.105, 0.86, 0);

    const buildLeg = (
      hipPivot: TransformNode,
      side: string
    ): { knee: TransformNode; ankle: TransformNode } => {
      const hipCap = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerHipCap_${side}`,
          { diameter: 0.145, segments: 10 },
          scene
        )
      );
      hipCap.parent = hipPivot;
      hipCap.material = trouserMat;

      const thigh = trackMesh(
        MeshBuilder.CreateCylinder(
          `explorerThigh_${side}`,
          { height: 0.38, diameterTop: 0.145, diameterBottom: 0.12, tessellation: 10 },
          scene
        )
      );
      thigh.parent = hipPivot;
      thigh.position.y = -0.19;
      thigh.material = trouserMat;

      const kneePivot = new TransformNode(`explorerKnee_${side}`, scene);
      kneePivot.parent = hipPivot;
      kneePivot.position.y = -0.38;

      const kneeJoint = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerKneeJoint_${side}`,
          { diameter: 0.118, segments: 8 },
          scene
        )
      );
      kneeJoint.parent = kneePivot;
      kneeJoint.material = trouserMat;

      const shin = trackMesh(
        MeshBuilder.CreateCylinder(
          `explorerShin_${side}`,
          { height: 0.37, diameterTop: 0.118, diameterBottom: 0.095, tessellation: 10 },
          scene
        )
      );
      shin.parent = kneePivot;
      shin.position.y = -0.185;
      shin.material = trouserMat;

      const anklePivot = new TransformNode(`explorerAnkle_${side}`, scene);
      anklePivot.parent = kneePivot;
      anklePivot.position.y = -0.37;

      const bootCuff = trackMesh(
        MeshBuilder.CreateCylinder(
          `explorerBootCuff_${side}`,
          { height: 0.1, diameterTop: 0.116, diameterBottom: 0.11, tessellation: 10 },
          scene
        )
      );
      bootCuff.parent = anklePivot;
      bootCuff.position.y = -0.02;
      bootCuff.material = leatherMat;

      const bootUpper = trackMesh(
        MeshBuilder.CreateBox(
          `explorerBootUpper_${side}`,
          { width: 0.122, height: 0.075, depth: 0.2 },
          scene
        )
      );
      bootUpper.parent = anklePivot;
      bootUpper.position.set(0, -0.055, 0.035);
      bootUpper.material = leatherMat;

      const bootToe = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerBootToe_${side}`,
          { diameter: 0.114, segments: 8 },
          scene
        )
      );
      bootToe.parent = anklePivot;
      bootToe.position.set(0, -0.058, 0.115);
      bootToe.scaling.set(1.04, 0.65, 1.0);
      bootToe.material = leatherMat;

      // Boot sole bottom sits at -0.10 - 0.01 = -0.11 below ankle (0.86 - 0.38 - 0.37 - 0.11 = 0.000m)
      const bootSole = trackMesh(
        MeshBuilder.CreateBox(
          `explorerBootSole_${side}`,
          { width: 0.132, height: 0.02, depth: 0.23 },
          scene
        )
      );
      bootSole.parent = anklePivot;
      bootSole.position.set(0, -0.1, 0.042);
      bootSole.material = soleMat;

      return { knee: kneePivot, ankle: anklePivot };
    };

    const leftJoints = buildLeg(this.leftHip, 'L');
    this.leftKnee = leftJoints.knee;
    this.leftAnkle = leftJoints.ankle;

    const rightJoints = buildLeg(this.rightHip, 'R');
    this.rightKnee = rightJoints.knee;
    this.rightAnkle = rightJoints.ankle;
  }

  public setFacingYaw(yaw: number): void {
    this.visualRoot.rotation.y = yaw;
  }

  public getFacingYaw(): number {
    return this.visualRoot.rotation.y;
  }

  public updateAnimation(
    dt: number,
    state: CharacterMovementState,
    normalizedSpeed: number
  ): void {
    const isMoving = state === 'walk' || state === 'run';
    const isRunning = state === 'run';
    const isJumping = state === 'jump';

    const targetStrideBlend = isMoving ? Math.max(0.25, normalizedSpeed) : 0;
    const targetLean = isRunning ? 0.18 : isMoving ? 0.07 : 0;
    const targetJumpBlend = isJumping ? 1 : 0;

    const blendRate = 1 - Math.exp(-12 * dt);
    this.currentStrideBlend = Scalar.Lerp(
      this.currentStrideBlend,
      targetStrideBlend,
      blendRate
    );
    this.currentLean = Scalar.Lerp(this.currentLean, targetLean, blendRate);
    this.currentJumpBlend = Scalar.Lerp(
      this.currentJumpBlend,
      targetJumpBlend,
      1 - Math.exp(-14 * dt)
    );

    const cycleSpeed = isRunning ? 12.2 : isMoving ? 7.8 : 2.1;
    this.animTime += dt * cycleSpeed;

    const strideAmp = isRunning ? 0.68 : 0.44;
    const sSin = Math.sin(this.animTime);
    const sCos = Math.cos(this.animTime);

    // Negative rotation.x swings limbs forward (+Z); positive swings backward (-Z)
    const leftHipTarget = -sSin * strideAmp * this.currentStrideBlend;
    const rightHipTarget = sSin * strideAmp * this.currentStrideBlend;

    // Bend knees cleanly during forward recovery so trailing foot clears ground
    const kneeAmp = isRunning ? 0.85 : 0.52;
    const leftKneeTarget = Math.max(0, sCos) * kneeAmp * this.currentStrideBlend;
    const rightKneeTarget = Math.max(0, -sCos) * kneeAmp * this.currentStrideBlend;

    // Subtle ankle counter-flexion keeps boot sole parallel to ground on stride
    const leftAnkleTarget = -leftKneeTarget * 0.35;
    const rightAnkleTarget = -rightKneeTarget * 0.35;

    // Opposite arms swing naturally with slight elbow bend
    const armAmp = isRunning ? 0.66 : 0.4;
    const leftShoulderTarget = sSin * armAmp * this.currentStrideBlend;
    const rightShoulderTarget = -sSin * armAmp * this.currentStrideBlend;
    const baseElbowBend = isRunning ? -0.78 : isMoving ? -0.38 : -0.12;
    const leftElbowTarget = baseElbowBend - Math.max(0, -sSin) * 0.25 * this.currentStrideBlend;
    const rightElbowTarget = baseElbowBend - Math.max(0, sSin) * 0.25 * this.currentStrideBlend;

    // Jump pose coordinates knees, hips, and raised arms
    const jumpLeftHip = -0.34;
    const jumpRightHip = 0.22;
    const jumpLeftKnee = 0.65;
    const jumpRightKnee = 0.42;
    const jumpArmRaise = -0.62;
    const jumpElbow = -0.58;
    const jumpArmOut = 0.26 * this.currentJumpBlend;

    this.leftHip.rotation.x = Scalar.Lerp(leftHipTarget, jumpLeftHip, this.currentJumpBlend);
    this.rightHip.rotation.x = Scalar.Lerp(rightHipTarget, jumpRightHip, this.currentJumpBlend);
    this.leftKnee.rotation.x = Scalar.Lerp(leftKneeTarget, jumpLeftKnee, this.currentJumpBlend);
    this.rightKnee.rotation.x = Scalar.Lerp(rightKneeTarget, jumpRightKnee, this.currentJumpBlend);
    this.leftAnkle.rotation.x = Scalar.Lerp(leftAnkleTarget, 0.12, this.currentJumpBlend);
    this.rightAnkle.rotation.x = Scalar.Lerp(rightAnkleTarget, 0.18, this.currentJumpBlend);

    this.leftShoulder.rotation.x = Scalar.Lerp(
      leftShoulderTarget,
      jumpArmRaise,
      this.currentJumpBlend
    );
    this.rightShoulder.rotation.x = Scalar.Lerp(
      rightShoulderTarget,
      jumpArmRaise,
      this.currentJumpBlend
    );
    this.leftShoulder.rotation.z = 0.06 + jumpArmOut;
    this.rightShoulder.rotation.z = -0.06 - jumpArmOut;
    this.leftElbow.rotation.x = Scalar.Lerp(leftElbowTarget, jumpElbow, this.currentJumpBlend);
    this.rightElbow.rotation.x = Scalar.Lerp(rightElbowTarget, jumpElbow, this.currentJumpBlend);

    // Subtle upper-body breathing in idle & natural stride lift (never sinking feet below y=0)
    const idleBob = Math.sin(this.animTime * 1.1) * 0.012 * (1 - this.currentStrideBlend);
    const walkBob =
      Math.abs(sSin) * (isRunning ? 0.055 : 0.028) * this.currentStrideBlend;

    this.bodyPivot.position.y = 0.86 + idleBob + walkBob;
    this.bodyPivot.rotation.x = this.currentLean;
    this.headPivot.rotation.x = -this.currentLean * 0.55;
  }

  public dispose(): void {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.root.dispose();
  }
}

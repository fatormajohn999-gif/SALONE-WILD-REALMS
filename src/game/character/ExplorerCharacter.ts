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
  private readonly leftHip: TransformNode;
  private readonly rightHip: TransformNode;
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
    this.bodyPivot.position.y = 0.88;

    // Stylized earthy materials
    const tunicMat = new StandardMaterial('explorerTunicMat', scene);
    tunicMat.diffuseColor = new Color3(0.13, 0.34, 0.23); // Deep forest green
    tunicMat.specularColor = new Color3(0.08, 0.1, 0.08);

    const trouserMat = new StandardMaterial('explorerTrouserMat', scene);
    trouserMat.diffuseColor = new Color3(0.17, 0.21, 0.19); // Dark natural slate
    trouserMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const leatherMat = new StandardMaterial('explorerLeatherMat', scene);
    leatherMat.diffuseColor = new Color3(0.32, 0.22, 0.15); // Boots & belt
    leatherMat.specularColor = new Color3(0.12, 0.1, 0.08);

    const packMat = new StandardMaterial('explorerPackMat', scene);
    packMat.diffuseColor = new Color3(0.54, 0.44, 0.3); // Canvas tan backpack
    packMat.specularColor = new Color3(0.06, 0.05, 0.04);

    const bedrollMat = new StandardMaterial('explorerBedrollMat', scene);
    bedrollMat.diffuseColor = new Color3(0.32, 0.43, 0.35);
    bedrollMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const brassMat = new StandardMaterial('explorerBrassMat', scene);
    brassMat.diffuseColor = new Color3(0.78, 0.66, 0.41);
    brassMat.specularColor = new Color3(0.35, 0.3, 0.2);

    const skinMat = new StandardMaterial('explorerSkinMat', scene);
    skinMat.diffuseColor = new Color3(0.84, 0.65, 0.51);
    skinMat.specularColor = new Color3(0.08, 0.06, 0.05);

    const hatMat = new StandardMaterial('explorerHatMat', scene);
    hatMat.diffuseColor = new Color3(0.42, 0.36, 0.25);
    hatMat.specularColor = new Color3(0.07, 0.06, 0.05);

    const trackMesh = (mesh: AbstractMesh): AbstractMesh => {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.meshes.push(mesh);
      registerShadowCaster?.(mesh);
      return mesh;
    };

    // Torso (centered above pelvis)
    const torso = trackMesh(
      MeshBuilder.CreateBox(
        'explorerTorso',
        { width: 0.48, height: 0.58, depth: 0.28 },
        scene
      )
    );
    torso.parent = this.bodyPivot;
    torso.position.y = 0.28;
    torso.material = tunicMat;

    // Belt + brass clasp
    const belt = trackMesh(
      MeshBuilder.CreateBox(
        'explorerBelt',
        { width: 0.5, height: 0.09, depth: 0.3 },
        scene
      )
    );
    belt.parent = this.bodyPivot;
    belt.position.y = 0.06;
    belt.material = leatherMat;

    const buckle = trackMesh(
      MeshBuilder.CreateBox(
        'explorerBuckle',
        { width: 0.1, height: 0.08, depth: 0.03 },
        scene
      )
    );
    buckle.parent = this.bodyPivot;
    buckle.position.set(0, 0.06, 0.155);
    buckle.material = brassMat;

    // Explorer Backpack on -Z (back)
    const backpack = trackMesh(
      MeshBuilder.CreateBox(
        'explorerBackpack',
        { width: 0.38, height: 0.44, depth: 0.2 },
        scene
      )
    );
    backpack.parent = this.bodyPivot;
    backpack.position.set(0, 0.3, -0.22);
    backpack.material = packMat;

    const bedroll = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerBedroll',
        { height: 0.42, diameter: 0.14, tessellation: 10 },
        scene
      )
    );
    bedroll.parent = this.bodyPivot;
    bedroll.position.set(0, 0.55, -0.22);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.material = bedrollMat;

    // Head & Explorer Cap
    this.headPivot = new TransformNode('explorerHeadPivot', scene);
    this.headPivot.parent = this.bodyPivot;
    this.headPivot.position.y = 0.61;

    const head = trackMesh(
      MeshBuilder.CreateSphere(
        'explorerHead',
        { diameter: 0.34, segments: 12 },
        scene
      )
    );
    head.parent = this.headPivot;
    head.position.y = 0.17;
    head.material = skinMat;

    const capCrown = trackMesh(
      MeshBuilder.CreateCylinder(
        'explorerCapCrown',
        { height: 0.14, diameterTop: 0.31, diameterBottom: 0.36, tessellation: 12 },
        scene
      )
    );
    capCrown.parent = this.headPivot;
    capCrown.position.y = 0.29;
    capCrown.material = hatMat;

    const capBrim = trackMesh(
      MeshBuilder.CreateBox(
        'explorerCapBrim',
        { width: 0.34, height: 0.035, depth: 0.22 },
        scene
      )
    );
    capBrim.parent = this.headPivot;
    capBrim.position.set(0, 0.24, 0.16);
    capBrim.rotation.x = 0.12;
    capBrim.material = hatMat;

    // Arms
    this.leftShoulder = new TransformNode('explorerLeftShoulder', scene);
    this.leftShoulder.parent = this.bodyPivot;
    this.leftShoulder.position.set(-0.32, 0.5, 0);

    this.rightShoulder = new TransformNode('explorerRightShoulder', scene);
    this.rightShoulder.parent = this.bodyPivot;
    this.rightShoulder.position.set(0.32, 0.5, 0);

    const buildArm = (pivot: TransformNode, side: string): void => {
      const sleeve = trackMesh(
        MeshBuilder.CreateBox(
          `explorerSleeve_${side}`,
          { width: 0.14, height: 0.36, depth: 0.14 },
          scene
        )
      );
      sleeve.parent = pivot;
      sleeve.position.y = -0.18;
      sleeve.material = tunicMat;

      const hand = trackMesh(
        MeshBuilder.CreateSphere(
          `explorerHand_${side}`,
          { diameter: 0.12, segments: 8 },
          scene
        )
      );
      hand.parent = pivot;
      hand.position.y = -0.4;
      hand.material = skinMat;
    };

    buildArm(this.leftShoulder, 'L');
    buildArm(this.rightShoulder, 'R');

    // Legs & Boots (pivoting at hip y = 0.88 down to feet y = 0)
    this.leftHip = new TransformNode('explorerLeftHip', scene);
    this.leftHip.parent = this.visualRoot;
    this.leftHip.position.set(-0.13, 0.84, 0);

    this.rightHip = new TransformNode('explorerRightHip', scene);
    this.rightHip.parent = this.visualRoot;
    this.rightHip.position.set(0.13, 0.84, 0);

    const buildLeg = (pivot: TransformNode, side: string): void => {
      const leg = trackMesh(
        MeshBuilder.CreateBox(
          `explorerLeg_${side}`,
          { width: 0.16, height: 0.64, depth: 0.18 },
          scene
        )
      );
      leg.parent = pivot;
      leg.position.y = -0.34;
      leg.material = trouserMat;

      const boot = trackMesh(
        MeshBuilder.CreateBox(
          `explorerBoot_${side}`,
          { width: 0.18, height: 0.18, depth: 0.25 },
          scene
        )
      );
      boot.parent = pivot;
      boot.position.set(0, -0.75, 0.03);
      boot.material = leatherMat;
    };

    buildLeg(this.leftHip, 'L');
    buildLeg(this.rightHip, 'R');
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
    const targetLean = isRunning ? 0.19 : isMoving ? 0.07 : 0;
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

    const strideAmplitude = isRunning ? 0.72 : 0.46;
    const legSwing = Math.sin(this.animTime) * strideAmplitude * this.currentStrideBlend;
    const armSwing = legSwing * 0.88;

    // Subtle idle breathing bob
    const idleBob = Math.sin(this.animTime * 1.1) * 0.015 * (1 - this.currentStrideBlend);
    // Stride bounce (twice per cycle)
    const walkBob = Math.abs(Math.sin(this.animTime)) * (isRunning ? 0.07 : 0.035) * this.currentStrideBlend;

    // Combine ground locomotion with jump pose
    const jumpLegAngle = -0.35 * this.currentJumpBlend;
    const jumpArmRaise = -0.55 * this.currentJumpBlend;
    const jumpArmOut = 0.24 * this.currentJumpBlend;

    this.leftHip.rotation.x = Scalar.Lerp(legSwing, jumpLegAngle, this.currentJumpBlend);
    this.rightHip.rotation.x = Scalar.Lerp(-legSwing, -jumpLegAngle * 0.5, this.currentJumpBlend);

    this.leftShoulder.rotation.x = Scalar.Lerp(-armSwing, jumpArmRaise, this.currentJumpBlend);
    this.rightShoulder.rotation.x = Scalar.Lerp(armSwing, jumpArmRaise, this.currentJumpBlend);
    this.leftShoulder.rotation.z = 0.06 + jumpArmOut;
    this.rightShoulder.rotation.z = -0.06 - jumpArmOut;

    this.bodyPivot.position.y = 0.88 + idleBob + walkBob;
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

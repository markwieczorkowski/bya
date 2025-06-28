import * as THREE from 'three';
// @ts-ignore: Ignore missing type declaration for GLTFLoader if not present
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { AnimationMixer, AnimationAction, Clock } from 'three';
// Optionally import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

export class Cow {
    private mesh: THREE.Group;
    private velocity: THREE.Vector3;
    private moveSpeed: number = 0.1;
    private fleeDistance: number = 15;
    private fleeSpeed: number = 0.3;
    private baseHeight: number = 0.4; // Height of legs
    private isBeingAbducted: boolean = false;
    private abductionTarget: THREE.Vector3 | null = null;
    private abductionSpeed: number = 0.1;
    private spinSpeed: number = 0.1;
    private _isFalling: boolean = false;
    private fallVelocity: number = 0;
    private readonly GRAVITY: number = 0.015;
    private readonly TERMINAL_VELOCITY: number = -0.5;
    private readonly BEAM_CENTER_FORCE: number = 0.8;  // Increased for stronger centering
    private mixer?: AnimationMixer;
    private actions: { [name: string]: AnimationAction } = {};
    private currentAction?: AnimationAction;
    private clock = new Clock();

    constructor() {
        this.mesh = new THREE.Group();
        this.velocity = new THREE.Vector3();
        this.loadCowModel();
    }

    private loadCowModel(): void {
        // Add a placeholder while loading
        const placeholder = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        this.mesh.add(placeholder);

        const loader = new GLTFLoader();
        loader.load(
            '/src/models/Cow.glb',
            (gltf: any) => {
                // Remove placeholder
                this.mesh.remove(placeholder);
                // Add loaded model
                const cowModel = gltf.scene;
                cowModel.scale.set(0.4, 0.4, 0.4); // Scale down by 60%
                cowModel.traverse((child: THREE.Object3D) => {
                    if ((child as THREE.Mesh).isMesh) {
                        (child as THREE.Mesh).castShadow = true;
                        (child as THREE.Mesh).receiveShadow = true;
                    }
                });
                this.mesh.add(cowModel);
                // Log model structure and animations
                console.log('Loaded Cow.glb:', { cowModel, animations: gltf.animations });
                // List all animation names
                if (gltf.animations && gltf.animations.length > 0) {
                    console.log('Cow model animation names:');
                    gltf.animations.forEach((clip: any) => console.log(clip.name));
                    // Setup animation mixer and actions
                    this.mixer = new AnimationMixer(cowModel);
                    gltf.animations.forEach((clip: any) => {
                        this.actions[clip.name] = this.mixer!.clipAction(clip);
                    });
                    // Start with walk animation (replace 'Walk' with actual name if needed)
                    this.playAnimation('Walk');
                }
            },
            undefined,
            (error: ErrorEvent) => {
                console.error('Error loading Cow.glb:', error);
            }
        );
    }

    private createCowModel(): void {
        // No longer needed, replaced by loadCowModel
    }

    private playAnimation(name: string) {
        if (!this.mixer || !this.actions[name]) return;
        if (this.currentAction === this.actions[name]) return;
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        this.currentAction = this.actions[name];
        this.currentAction.reset().fadeIn(0.2).play();
    }

    update(ufoPosition: THREE.Vector3): void {
        if (this._isFalling) {
            console.log('Cow falling', {
                y: this.mesh.position.y,
                fallVelocity: this.fallVelocity
            });
            
            // Apply gravity
            this.fallVelocity = Math.max(this.fallVelocity - this.GRAVITY, this.TERMINAL_VELOCITY);
            
            // Update position with fall velocity
            const newPosition = this.mesh.position.clone();
            newPosition.y += this.fallVelocity;
            this.mesh.position.copy(newPosition);

            // Slow down spinning during fall
            this.spinSpeed *= 0.95;
            this.mesh.rotation.y += this.spinSpeed;

            // Gradually return to upright
            if (Math.abs(this.mesh.rotation.x) > 0.01) {
                this.mesh.rotation.x *= 0.95;
            }

            return;
        }

        if (this.isBeingAbducted && this.abductionTarget) {
            // Update abduction target to current UFO position
            this.abductionTarget.x = ufoPosition.x;
            this.abductionTarget.z = ufoPosition.z;
            
            // Calculate new position
            const newPosition = this.mesh.position.clone();
            
            // Get vector to current beam center
            const toBeamCenter = new THREE.Vector3(
                this.abductionTarget.x - newPosition.x,
                0,
                this.abductionTarget.z - newPosition.z
            );
            
            // Strong centering force
            const horizontalDistance = toBeamCenter.length();
            
            // Apply immediate position correction if too far from beam
            if (horizontalDistance > 3) {
                // Snap back into beam range
                toBeamCenter.normalize();
                newPosition.x = this.abductionTarget.x - toBeamCenter.x * 2;
                newPosition.z = this.abductionTarget.z - toBeamCenter.z * 2;
            } else if (horizontalDistance > 0.01) {
                // Normal centering within beam
                toBeamCenter.normalize();
                // Stronger centering force when further from center
                const centeringForce = Math.min(this.BEAM_CENTER_FORCE * horizontalDistance, 1.0);
                newPosition.x += toBeamCenter.x * centeringForce;
                newPosition.z += toBeamCenter.z * centeringForce;
            }
            
            // Only move upward if reasonably centered
            if (horizontalDistance < 2) {
                newPosition.y += this.abductionSpeed;
                // Increase speed gradually when centered
                this.abductionSpeed = Math.min(this.abductionSpeed * 1.05, 0.5);
            } else {
                // Reset abduction speed when not centered
                this.abductionSpeed = 0.2;
            }
            
            // Apply the new position
            this.mesh.position.copy(newPosition);
            
            // Spin
            this.mesh.rotation.y += this.spinSpeed;
            
            // Gradually tilt to horizontal
            const targetTilt = Math.PI / 2;
            const currentTilt = this.mesh.rotation.x;
            if (Math.abs(currentTilt - targetTilt) > 0.01) {
                this.mesh.rotation.x += (targetTilt - currentTilt) * 0.1;
            }
            
            return;
        }

        // Normal wandering behavior
        const cowPosition = this.mesh.position;
        const directionToUFO = new THREE.Vector3()
            .subVectors(ufoPosition, cowPosition)
            .setY(0)
            .normalize();
        const distanceToUFO = cowPosition.distanceTo(ufoPosition);

        // Calculate new velocity
        if (distanceToUFO < this.fleeDistance) {
            // Flee from UFO
            this.velocity.copy(directionToUFO.multiplyScalar(-this.fleeSpeed));
        } else {
            // Random wandering
            if (Math.random() < 0.02) {
                const randomAngle = Math.random() * Math.PI * 2;
                this.velocity.set(
                    Math.cos(randomAngle) * this.moveSpeed,
                    0,
                    Math.sin(randomAngle) * this.moveSpeed
                );
            }
        }

        // Update position
        const newPosition = new THREE.Vector3().copy(this.mesh.position).add(this.velocity);
        this.mesh.position.copy(newPosition);

        // Update rotation to face movement direction
        if (this.velocity.length() > 0.01) {
            const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
            let currentAngle = this.mesh.rotation.y;
            
            // Calculate shortest rotation path
            let angleDiff = targetAngle - currentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            // Smoothly rotate
            this.mesh.rotation.y += angleDiff * 0.1;
        }

        // Apply damping
        this.velocity.multiplyScalar(0.95);

        // Animation switching logic
        if (this.mixer) {
            const speed = this.velocity.length();
            // Use actual animation names from the model
            if (speed > 0.18) {
                this.playAnimation('Armature|Run');
            } else if (speed > 0.08) {
                this.playAnimation('Armature|Walk');
            } else if (speed > 0.01) {
                this.playAnimation('Armature|WalkSlow');
            } else {
                this.playAnimation('Armature|Idle');
            }
            this.mixer.update(this.clock.getDelta());
        }
    }

    startAbduction(targetPosition: THREE.Vector3): void {
        console.log('Starting abduction');
        this.isBeingAbducted = true;
        this._isFalling = false;
        // Store target as new vector to avoid reference issues
        this.abductionTarget = new THREE.Vector3(
            targetPosition.x,
            targetPosition.y,
            targetPosition.z
        );
        this.abductionSpeed = 0.2;
        this.spinSpeed = 0.1;
        this.fallVelocity = 0;
        this.velocity.set(0, 0, 0);
    }

    stopAbduction(): void {
        console.log('Stopping abduction - initiating fall');
        this.isBeingAbducted = false;
        this._isFalling = true;
        this.abductionTarget = null;
        this.fallVelocity = 0;
        this.abductionSpeed = 0.2; // Reset for next abduction
        // Keep current rotation for falling animation
    }

    isUnderAbduction(): boolean {
        return this.isBeingAbducted;
    }

    isFalling(): boolean {
        return this._isFalling;
    }

    getNextPosition(): THREE.Vector3 {
        if (this.isBeingAbducted && this.abductionTarget) {
            return this.abductionTarget.clone();
        }
        return new THREE.Vector3().copy(this.mesh.position).add(this.velocity);
    }

    alignToNormal(normal: THREE.Vector3): void {
        // For now, just keep cows upright
        // We can add terrain alignment later if needed
    }

    getMesh(): THREE.Group {
        return this.mesh;
    }

    getPosition(): THREE.Vector3 {
        return this.mesh.position;
    }

    setPosition(x: number, y: number, z: number): void {
        const oldY = this.mesh.position.y;
        this.mesh.position.set(x, y, z);
        
        // Check if we've hit the ground
        if (this._isFalling && y <= this.baseHeight) {
            console.log('Cow landed', {
                finalY: y,
                wasY: oldY
            });
            // Reset all states on landing
            this._isFalling = false;
            this.fallVelocity = 0;
            this.spinSpeed = 0;
            this.mesh.rotation.x = 0;
            this.velocity.set(0, 0, 0);
        }
    }

    // Make the cow flee from an arbitrary position (e.g., beam impact)
    fleeFrom(target: THREE.Vector3): void {
        const cowPosition = this.mesh.position;
        const direction = new THREE.Vector3().subVectors(cowPosition, target).setY(0).normalize();
        this.velocity.copy(direction.multiplyScalar(this.fleeSpeed));
    }
} 
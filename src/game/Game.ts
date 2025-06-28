import * as THREE from 'three';
import { UFO } from './components/UFO';
import { Terrain } from './components/Terrain';
import { Cow } from './components/Cow';
import { Controls } from './utils/Controls';

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private ufo: UFO;
    private terrain: Terrain;
    private cows: Cow[] = [];
    private controls: Controls;
    private score: number = 0;
    private level: number = 1;
    private scoreElement: HTMLDivElement;
    private levelElement: HTMLDivElement;
    private altitudeElement: HTMLDivElement;  // New altitude display element
    private colliders: THREE.Object3D[] = [];
    private lastColliderUpdate: number = 0;
    private readonly COLLIDER_UPDATE_INTERVAL: number = 1000; // Update colliders every 1 second
    private lastBeamActive = false;

    // Victory state management
    private isVictorySequence: boolean = false;
    private victoryStartTime: number = 0;
    private victoryMessage: THREE.Group | null = null;
    private victoryParticles: THREE.Group | null = null;

    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        // Create score overlay
        this.scoreElement = document.createElement('div');
        this.scoreElement.id = 'score-overlay';
        this.updateScore(0);
        document.body.appendChild(this.scoreElement);

        // Create level overlay
        this.levelElement = document.createElement('div');
        this.levelElement.id = 'level-overlay';
        this.levelElement.style.position = 'fixed';
        this.levelElement.style.top = '40px';
        this.levelElement.style.left = '10px';
        this.levelElement.style.color = 'white';
        this.levelElement.style.fontFamily = 'monospace';
        this.levelElement.style.fontSize = '16px';
        this.levelElement.style.textShadow = '2px 2px 2px black';
        this.updateLevel(1);
        document.body.appendChild(this.levelElement);

        // Create altitude overlay
        this.altitudeElement = document.createElement('div');
        this.altitudeElement.id = 'altitude-overlay';
        this.altitudeElement.style.position = 'fixed';
        this.altitudeElement.style.top = '10px';
        this.altitudeElement.style.left = '10px';
        this.altitudeElement.style.color = 'white';
        this.altitudeElement.style.fontFamily = 'monospace';
        this.altitudeElement.style.fontSize = '16px';
        this.altitudeElement.style.textShadow = '2px 2px 2px black';
        document.body.appendChild(this.altitudeElement);

        // Setup game components
        this.terrain = new Terrain();
        this.ufo = new UFO(this.terrain, this.scene);
        this.controls = new Controls(this.ufo);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);

        // Add directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(100, 100, 50);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Handle window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Add victory shortcut key listener
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Digit9' && !this.isVictorySequence) {
                console.log('Victory shortcut triggered!');
                this.startVictorySequence();
            }
        });
    }

    initialize(): void {
        document.body.appendChild(this.renderer.domElement);
        
        // Add components to scene
        const terrainMesh = this.terrain.getMesh();
        terrainMesh.userData.type = 'terrain';
        this.scene.add(terrainMesh);

        const ufoMesh = this.ufo.getMesh();
        ufoMesh.userData.type = 'ufo';
        ufoMesh.userData.collisionRadius = 2;
        this.scene.add(ufoMesh);
        
        // Add the reticle group to the scene
        this.scene.add(this.ufo.getReticleGroup());

        // Initialize cows
        this.spawnCows();

        // Reset and collect all colliders
        this.colliders = [];
        console.log('Initializing colliders...');
        
        // Get all terrain objects (trees, buildings, fences)
        const terrainColliders = this.terrain.getColliders();
        
        // Debug counter for mesh types
        const meshCounts: {
            total: number;
            untyped: number;
            byType: { [key: string]: number };
        } = {
            total: 0,
            untyped: 0,
            byType: {}
        };

        // Process terrain colliders
        for (const object of terrainColliders) {
            if (!(object instanceof THREE.Mesh)) continue;
            
            meshCounts.total++;
            
            if (!object.userData.type) {
                meshCounts.untyped++;
                console.warn('Found mesh without type:', object);
                continue;
            }

            // Count meshes by type
            const type = object.userData.type as string;
            meshCounts.byType[type] = (meshCounts.byType[type] || 0) + 1;

            // Only collect specific types as colliders
            if (!['tree', 'building', 'fence'].includes(type)) {
                continue;
            }

            // Set collision radius based on type
            switch (type) {
                case 'tree':
                    object.userData.collisionRadius = 2;
                    break;
                case 'building':
                    object.userData.collisionRadius = 4;
                    break;
                case 'fence':
                    object.userData.collisionRadius = 0.5;
                    break;
                default:
                    continue;
            }

            // Log each valid collider we're adding
            console.log('Adding collider:', {
                type: type,
                position: {
                    x: object.position.x.toFixed(2),
                    y: object.position.y.toFixed(2),
                    z: object.position.z.toFixed(2)
                },
                radius: object.userData.collisionRadius,
                parent: object.parent ? object.parent.userData.type : 'none'
            });

            this.colliders.push(object);
        }

        console.log('Mesh statistics:', meshCounts);
        console.log('Total colliders:', this.colliders.length);

        // Start game loop
        this.animate();
    }

    private spawnCows(): void {
        // Spawn 12 cows randomly on the terrain
        for (let i = 0; i < 12; i++) {
            const cow = new Cow();
            const x = (Math.random() - 0.5) * 100;
            const z = (Math.random() - 0.5) * 100;
            const y = this.terrain.getHeightAt(x, z);
            
            const cowMesh = cow.getMesh();
            cowMesh.userData.type = 'cow';
            cowMesh.userData.collisionRadius = 1;
            
            cow.setPosition(x, y, z);
            this.cows.push(cow);
            this.scene.add(cowMesh);
        }
    }

    private updateColliders(): void {
        const now = Date.now();
        if (now - this.lastColliderUpdate > this.COLLIDER_UPDATE_INTERVAL) {
            this.colliders = this.terrain.getColliders();
            this.lastColliderUpdate = now;
        }
    }

    private checkCollision(object: THREE.Object3D, newPosition: THREE.Vector3, radius: number = 1): boolean {
        // Check terrain height
        const terrainHeight = this.terrain.getHeightAt(newPosition.x, newPosition.z);
        
        // For UFO, check altitude limits and basic object distance
        if (object === this.ufo.getMesh()) {
            // Calculate new altitude
            const newAltitude = newPosition.y - terrainHeight;

            // Prevent ascending if already at or above max altitude
            const currentAltitude = this.ufo.getPosition().y - this.terrain.getHeightAt(this.ufo.getPosition().x, this.ufo.getPosition().z);
            if (currentAltitude >= 50 && newAltitude > currentAltitude) {
                return true;
            }

            // Keep UFO above terrain
            if (newPosition.y < terrainHeight + 2) {
                return true;
            }

            // Update colliders periodically instead of every frame
            this.updateColliders();

            // Basic collision check with buildings and trees
            for (const collider of this.colliders) {
                // Get world position of collider
                const worldPos = new THREE.Vector3();
                collider.getWorldPosition(worldPos);

                // Only check collision if we're close enough horizontally
                const horizontalDistance = new THREE.Vector2(
                    newPosition.x - worldPos.x,
                    newPosition.z - worldPos.z
                ).length();

                if (horizontalDistance < 10) {
                    const collisionRadius = collider.userData.collisionRadius || 1;
                    const verticalDistance = Math.abs(newPosition.y - worldPos.y);
                    const collisionHeight = collider.userData.type === 'tree' ? 6 : 
                                         collider.userData.type === 'building' ? 8 : 2;

                    // Check if we're actually colliding both horizontally and vertically
                    if (horizontalDistance < radius + collisionRadius && 
                        verticalDistance < collisionHeight) {
                        return true;
                    }
                }
            }
            return false;
        }
        
        // For cows, keep them on the terrain and handle collisions
        if (object.userData.type === 'cow') {
            // Keep cows on the terrain
            newPosition.y = terrainHeight;

            // Update colliders periodically
            this.updateColliders();

            // Check collisions with buildings and fences
            for (const collider of this.colliders) {
                if (collider.userData.type === 'tree') continue; // Cows can walk through trees
                
                const worldPos = new THREE.Vector3();
                collider.getWorldPosition(worldPos);
                
                const distance = new THREE.Vector2(
                    newPosition.x - worldPos.x,
                    newPosition.z - worldPos.z
                ).length();

                const collisionRadius = collider.userData.collisionRadius || 1;
                if (distance < radius + collisionRadius) {
                    return true;
                }
            }
            return false;
        }

        return false;
    }

    private updateScore(points: number): void {
        this.score += points;
        this.scoreElement.textContent = `Score: ${this.score}`;
    }

    private updateLevel(level: number): void {
        this.level = level;
        this.levelElement.textContent = `Level: ${this.level}`;
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private updateCamera(): void {
        const ufoPosition = this.ufo.getPosition();
        const ufoRotation = this.ufo.getRotation();
        
        // Position camera behind and slightly above UFO
        const distance = 15;
        const height = 8;
        const cameraOffset = new THREE.Vector3(
            -Math.sin(ufoRotation.y) * distance,
            height,
            -Math.cos(ufoRotation.y) * distance
        );
        
        this.camera.position.copy(ufoPosition).add(cameraOffset);
        this.camera.lookAt(ufoPosition);
    }

    private updateAltitude(): void {
        const ufoPosition = this.ufo.getPosition();
        const groundHeight = this.terrain.getHeightAt(ufoPosition.x, ufoPosition.z);
        const altitude = ufoPosition.y - groundHeight;
        this.altitudeElement.textContent = `Altitude: ${altitude.toFixed(1)}`;
    }

    private animate(): void {
        requestAnimationFrame(this.animate.bind(this));

        // If victory sequence is active, only update that
        if (this.isVictorySequence) {
            this.updateVictorySequence();
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Check if beam needs to be deactivated due to timeout
        this.ufo.checkBeamTimeout();

        // Get UFO's intended next position
        const nextPosition = this.controls.getNextPosition();
        
        // Update UFO position with collision checks
        if (!this.checkCollision(this.ufo.getMesh(), nextPosition, 2)) {
            this.controls.update();
        }
        
        // Update camera position
        this.updateCamera();

        // Update altitude display
        this.updateAltitude();

        // Update beam reticle
        this.ufo.updateReticle();

        // Check altitude for beam deactivation
        const ufoPosition = this.ufo.getPosition();
        const groundHeight = this.terrain.getHeightAt(ufoPosition.x, ufoPosition.z);
        const altitude = ufoPosition.y - groundHeight;
        
        if (altitude > 25 && this.controls.isBeamActive()) {
            console.log('Beam deactivated - too high');
            this.ufo.toggleBeam(false);
        }

        // Check for beam deactivation first
        if (!this.controls.isBeamActive()) {
            this.cows.forEach(cow => {
                if (cow.isUnderAbduction()) {
                    console.log('Beam deactivated - dropping cow');
                    cow.stopAbduction();
                }
            });
        }

        // Update cows with collision checks
        this.cows.forEach(cow => {
            const cowMesh = cow.getMesh();
            const currentPos = cowMesh.position;
            
            // Get terrain height at current position
            const terrainHeight = this.terrain.getHeightAt(currentPos.x, currentPos.z);

            // Force to terrain height if not being abducted and either:
            // 1. Below terrain
            // 2. Not falling and above terrain
            if (!cow.isUnderAbduction() && 
                (currentPos.y < terrainHeight || (!cow.isFalling() && currentPos.y > terrainHeight))) {
                cow.setPosition(currentPos.x, terrainHeight, currentPos.z);
            }

            // Update movement and rotation
            cow.update(this.ufo.getPosition());
        });

        // Check for cow abduction only if beam is active
        if (this.controls.isBeamActive()) {
            this.checkCowAbduction();
        }

        // Detect beam activation
        const beamActive = this.ufo.getBeamActive();
        if (beamActive && !this.lastBeamActive) {
            this.triggerCowFleeFromBeam();
        }
        this.lastBeamActive = beamActive;

        this.renderer.render(this.scene, this.camera);
    }

    private checkCowAbduction(): void {
        const ufoPosition = this.ufo.getPosition();
        const beamRadius = this.ufo.getBeamRadius();
        let cowsInBeam = 0;
        let hasCaughtAnyCows = false;

        this.cows.forEach(cow => {
            const cowPosition = cow.getPosition();
            const horizontalDistance = new THREE.Vector2(
                cowPosition.x - ufoPosition.x,
                cowPosition.z - ufoPosition.z
            ).length();
            
            if (horizontalDistance < beamRadius) {
                if (!cow.isUnderAbduction()) {
                    console.log('Cow entering beam', {
                        cowPosition: cowPosition.clone(),
                        ufoPosition: ufoPosition.clone(),
                        horizontalDistance,
                        beamRadius
                    });
                    
                    // Reset beam cooldown when successfully catching a cow
                    this.ufo.resetBeamCooldown();
                    
                    const targetPosition = new THREE.Vector3(
                        ufoPosition.x,
                        ufoPosition.y - 2,
                        ufoPosition.z
                    );
                    cow.startAbduction(targetPosition);
                } else {
                    // Check if cow has reached UFO
                    const verticalDistance = ufoPosition.y - cowPosition.y;
                    if (verticalDistance < 2) {
                        console.log('Cow collected!');
                        this.scene.remove(cow.getMesh());
                        this.updateScore(10);
                        this.cows = this.cows.filter(c => c !== cow);
                        hasCaughtAnyCows = true;
                        
                        // Check if all cows have been captured
                        if (this.cows.length === 0) {
                            console.log('All cows captured! Starting victory sequence...');
                            this.startVictorySequence();
                        }
                    } else {
                        // Count cows still being abducted
                        cowsInBeam++;
                    }
                }
            }
        });

        // Only check for remaining cows if we've caught at least one cow
        if (hasCaughtAnyCows && cowsInBeam === 0 && this.controls.isBeamActive()) {
            console.log('All caught cows collected - deactivating and starting cooldown');
            this.ufo.startCooldownAfterCapture();
        }
    }

    private triggerCowFleeFromBeam(): void {
        const beamPos = this.ufo.getBeamGroundPosition();
        if (!beamPos) return;
        const fleeRadius = 13; // Distance from beam impact to trigger fleeing (increased by 30%)
        this.cows.forEach(cow => {
            const cowPos = cow.getPosition();
            const dist = Math.sqrt(
                Math.pow(cowPos.x - beamPos.x, 2) +
                Math.pow(cowPos.z - beamPos.z, 2)
            );
            if (dist < fleeRadius && !cow.isUnderAbduction()) {
                // Make the cow flee as if the UFO landed at the beam position
                cow.fleeFrom(beamPos);
            }
        });
    }

    private resetGame(): void {
        // Remove all cows from scene
        this.cows.forEach(cow => {
            this.scene.remove(cow.getMesh());
        });
        this.cows = [];

        // Reset UFO position
        this.ufo.setPosition(0, 10, 0);
        this.ufo.getMesh().rotation.set(0, 0, 0);

        // Reset camera to follow UFO normally
        this.updateCamera();

        // Spawn new cows for the next level
        this.spawnCows();

        // Reset colliders
        this.colliders = [];
        const terrainColliders = this.terrain.getColliders();
        
        for (const object of terrainColliders) {
            if (!(object instanceof THREE.Mesh)) continue;
            
            if (!object.userData.type) {
                continue;
            }

            if (!['tree', 'building', 'fence'].includes(object.userData.type)) {
                continue;
            }

            switch (object.userData.type) {
                case 'tree':
                    object.userData.collisionRadius = 2;
                    break;
                case 'building':
                    object.userData.collisionRadius = 4;
                    break;
                case 'fence':
                    object.userData.collisionRadius = 0.5;
                    break;
                default:
                    continue;
            }

            this.colliders.push(object);
        }

        console.log(`Level ${this.level} started with ${this.cows.length} cows`);
    }

    private startVictorySequence(): void {
        this.isVictorySequence = true;
        this.victoryStartTime = Date.now();
        
        console.log('Victory sequence started!');
    }

    private createVictoryMessage(): void {
        this.victoryMessage = new THREE.Group();
        
        // Create "MISSION COMPLETE" text using actual letter shapes
        const letters = 'MISSION COMPLETE'.split('');
        let xOffset = -8; // Start position
        
        letters.forEach((letter, _index) => {
            if (letter === ' ') {
                xOffset += 1.2;
                return;
            }
            
            // Create letter geometry based on the actual letter
            let letterGeometry: THREE.BufferGeometry;
            
            switch (letter) {
                case 'M':
                    letterGeometry = this.createLetterM();
                    break;
                case 'I':
                    letterGeometry = this.createLetterI();
                    break;
                case 'S':
                    letterGeometry = this.createLetterS();
                    break;
                case 'O':
                    letterGeometry = this.createLetterO();
                    break;
                case 'N':
                    letterGeometry = this.createLetterN();
                    break;
                case 'C':
                    letterGeometry = this.createLetterC();
                    break;
                case 'P':
                    letterGeometry = this.createLetterP();
                    break;
                case 'L':
                    letterGeometry = this.createLetterL();
                    break;
                case 'E':
                    letterGeometry = this.createLetterE();
                    break;
                case 'T':
                    letterGeometry = this.createLetterT();
                    break;
                default:
                    // Fallback to a simple box for unknown letters
                    letterGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.2);
            }
            
            const letterMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x00ff00,
                emissive: 0x00ff00,
                emissiveIntensity: 0.3
            });
            const letterMesh = new THREE.Mesh(letterGeometry, letterMaterial);
            letterMesh.position.set(xOffset, 0, 0);
            this.victoryMessage!.add(letterMesh);
            
            xOffset += 1.2;
        });
        
        // Position the message as a fixed HUD element in front of the camera
        this.victoryMessage.position.set(0, 0, -10);
        this.scene.add(this.victoryMessage);
    }

    // Helper methods to create letter geometries
    private createLetterM(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 1.2);
        shape.lineTo(0.3, 0.6);
        shape.lineTo(0.6, 1.2);
        shape.lineTo(0.6, 0);
        shape.lineTo(0, 0);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterI(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0.2, 0);
        shape.lineTo(0.2, 1.2);
        shape.lineTo(0.4, 1.2);
        shape.lineTo(0.4, 0);
        shape.lineTo(0.2, 0);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterS(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0.6, 1.2);
        shape.lineTo(0.2, 1.2);
        shape.lineTo(0.2, 0.8);
        shape.lineTo(0.6, 0.8);
        shape.lineTo(0.6, 0.4);
        shape.lineTo(0.2, 0.4);
        shape.lineTo(0.2, 0);
        shape.lineTo(0.6, 0);
        shape.lineTo(0.6, 1.2);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterO(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0.2, 0);
        shape.lineTo(0.4, 0);
        shape.lineTo(0.4, 1.2);
        shape.lineTo(0.2, 1.2);
        shape.lineTo(0.2, 0);
        
        const hole = new THREE.Path();
        hole.moveTo(0.25, 0.1);
        hole.lineTo(0.35, 0.1);
        hole.lineTo(0.35, 1.1);
        hole.lineTo(0.25, 1.1);
        hole.lineTo(0.25, 0.1);
        shape.holes.push(hole);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterN(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 1.2);
        shape.lineTo(0.6, 0);
        shape.lineTo(0.6, 1.2);
        shape.lineTo(0, 0);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterC(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0.6, 1.2);
        shape.lineTo(0.2, 1.2);
        shape.lineTo(0.2, 0);
        shape.lineTo(0.6, 0);
        shape.lineTo(0.6, 1.2);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterP(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 1.2);
        shape.lineTo(0.4, 1.2);
        shape.lineTo(0.6, 1.0);
        shape.lineTo(0.6, 0.8);
        shape.lineTo(0.4, 0.6);
        shape.lineTo(0, 0.6);
        shape.lineTo(0, 0);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterL(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0, 1.2);
        shape.lineTo(0, 0.2);
        shape.lineTo(0.6, 0.2);
        shape.lineTo(0.6, 0);
        shape.lineTo(0, 0);
        shape.lineTo(0, 1.2);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterE(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0.6, 1.2);
        shape.lineTo(0, 1.2);
        shape.lineTo(0, 0);
        shape.lineTo(0.6, 0);
        shape.lineTo(0.6, 0.2);
        shape.lineTo(0.2, 0.2);
        shape.lineTo(0.2, 0.5);
        shape.lineTo(0.5, 0.5);
        shape.lineTo(0.5, 0.7);
        shape.lineTo(0.2, 0.7);
        shape.lineTo(0.2, 1.0);
        shape.lineTo(0.6, 1.0);
        shape.lineTo(0.6, 1.2);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createLetterT(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(0, 1.2);
        shape.lineTo(0.6, 1.2);
        shape.lineTo(0.6, 1.0);
        shape.lineTo(0.35, 1.0);
        shape.lineTo(0.35, 0);
        shape.lineTo(0.25, 0);
        shape.lineTo(0.25, 1.0);
        shape.lineTo(0, 1.0);
        shape.lineTo(0, 1.2);
        
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createVictoryParticles(): void {
        const particleCount = 50; // Reduced count for better performance
        
        // Create a group to hold all particle meshes
        this.victoryParticles = new THREE.Group();
        
        for (let i = 0; i < particleCount; i++) {
            // Create small spheres for particles
            const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const particleMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Random position around the UFO
            const x = (Math.random() - 0.5) * 20;
            const y = (Math.random() - 0.5) * 20;
            const z = (Math.random() - 0.5) * 20;
            particle.position.set(x, y, z);
            
            // Store original position for animation
            particle.userData.originalY = y;
            particle.userData.animationSpeed = 0.05 + Math.random() * 0.1;
            
            this.victoryParticles.add(particle);
        }
        
        // Add some star-shaped particles
        for (let i = 0; i < 20; i++) {
            const starGeometry = new THREE.OctahedronGeometry(0.15);
            const starMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xffff00,
                emissive: 0xffff00,
                emissiveIntensity: 0.7,
                transparent: true,
                opacity: 0.9
            });
            const star = new THREE.Mesh(starGeometry, starMaterial);
            
            // Random position
            const x = (Math.random() - 0.5) * 25;
            const y = (Math.random() - 0.5) * 25;
            const z = (Math.random() - 0.5) * 25;
            star.position.set(x, y, z);
            
            // Store animation data
            star.userData.originalY = y;
            star.userData.animationSpeed = 0.08 + Math.random() * 0.12;
            star.userData.rotationSpeed = 0.02 + Math.random() * 0.03;
            
            this.victoryParticles.add(star);
        }
        
        // Position particles around the UFO
        const ufoPosition = this.ufo.getPosition();
        this.victoryParticles.position.set(ufoPosition.x, ufoPosition.y, ufoPosition.z);
        this.scene.add(this.victoryParticles);
    }

    private updateVictoryMessagePosition(): void {
        if (!this.victoryMessage) return;
        
        // Calculate position 10 units in front of the camera
        const cameraDirection = new THREE.Vector3(0, 0, -1);
        cameraDirection.applyQuaternion(this.camera.quaternion);
        
        const messagePosition = this.camera.position.clone().add(cameraDirection.multiplyScalar(10));
        this.victoryMessage.position.copy(messagePosition);
        
        // Make the message face the camera
        this.victoryMessage.lookAt(this.camera.position);
    }

    private updateVictorySequence(): void {
        if (!this.isVictorySequence) return;

        const now = Date.now();
        const elapsed = now - this.victoryStartTime;
        const ufoPosition = this.ufo.getPosition();

        // Update victory message position to stay in front of camera
        this.updateVictoryMessagePosition();

        // Phase 1: Camera smoothly moves closer and circles around UFO (0-3 seconds)
        if (elapsed < 3000) {
            const progress = elapsed / 3000;
            const angle = progress * Math.PI * 2; // Full circle
            const startRadius = 15;
            const endRadius = 9; // 40% closer
            const radius = startRadius + (endRadius - startRadius) * progress;
            const height = 8;
            
            // Circle around UFO with smooth distance change
            this.camera.position.x = ufoPosition.x + Math.sin(angle) * radius;
            this.camera.position.y = ufoPosition.y + height;
            this.camera.position.z = ufoPosition.z + Math.cos(angle) * radius;
            this.camera.lookAt(ufoPosition);
        }
        // Phase 2: Camera smoothly drops down in front of UFO (3-4 seconds)
        else if (elapsed < 4000) {
            const progress = (elapsed - 3000) / 1000;
            const radius = 9; // Now at close distance
            const startHeight = 8;
            const endHeight = -5;
            const height = startHeight + (endHeight - startHeight) * progress;
            
            this.camera.position.x = ufoPosition.x + Math.sin(Math.PI) * radius; // Front of UFO
            this.camera.position.y = ufoPosition.y + height;
            this.camera.position.z = ufoPosition.z + Math.cos(Math.PI) * radius;
            this.camera.lookAt(ufoPosition);
        }
        // Phase 3: Show victory message and particles (4-5 seconds)
        else if (elapsed < 5000) {
            // Create victory message and particles before UFO launches
            if (!this.victoryMessage) {
                this.createVictoryMessage();
            }
            if (!this.victoryParticles) {
                this.createVictoryParticles();
            }
            
            // Keep camera in front of UFO
            const radius = 9;
            this.camera.position.x = ufoPosition.x + Math.sin(Math.PI) * radius;
            this.camera.position.y = ufoPosition.y - 5;
            this.camera.position.z = ufoPosition.z + Math.cos(Math.PI) * radius;
            this.camera.lookAt(ufoPosition);
        }
        // Phase 4: UFO launches upward (5-7 seconds)
        else if (elapsed < 7000) {
            const progress = (elapsed - 5000) / 2000;
            const launchSpeed = 2;
            const newY = ufoPosition.y + (progress * 100 * launchSpeed);
            
            this.ufo.setPosition(ufoPosition.x, newY, ufoPosition.z);
            
            // Keep camera in front of UFO as it launches
            const radius = 9;
            this.camera.position.x = ufoPosition.x + Math.sin(Math.PI) * radius;
            this.camera.position.y = ufoPosition.y - 5;
            this.camera.position.z = ufoPosition.z + Math.cos(Math.PI) * radius;
            this.camera.lookAt(this.ufo.getPosition());
        }
        // Phase 5: UFO disappears (7-8 seconds)
        else if (elapsed < 8000) {
            const progress = (elapsed - 7000) / 1000;
            
            // Fade out UFO
            const ufoMesh = this.ufo.getMesh();
            ufoMesh.visible = progress > 0.5;
            
            // Keep camera steady for message viewing
            const radius = 9;
            this.camera.position.x = ufoPosition.x + Math.sin(Math.PI) * radius;
            this.camera.position.y = ufoPosition.y - 5;
            this.camera.position.z = ufoPosition.z + Math.cos(Math.PI) * radius;
            this.camera.lookAt(new THREE.Vector3(ufoPosition.x, ufoPosition.y + 50, ufoPosition.z));
        }
        // Phase 6: Victory message animation (8-13 seconds)
        else if (elapsed < 13000) {
            const progress = (elapsed - 8000) / 5000;
            
            if (this.victoryMessage) {
                // Scale up and down with pulsing effect
                const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.3;
                this.victoryMessage.scale.set(scale, scale, scale);
                
                // Add a slight rotation for visual interest
                this.victoryMessage.rotateY(progress * Math.PI * 0.5);
            }
            
            if (this.victoryParticles) {
                // Animate particles
                const particles = this.victoryParticles.children as THREE.Mesh[];
                particles.forEach(particle => {
                    // Move particles upward
                    particle.position.y += 0.1;
                    if (particle.position.y > 20) {
                        particle.position.y = -20; // Reset to bottom
                    }
                    
                    // Rotate stars
                    if (particle.userData.rotationSpeed) {
                        particle.rotation.y += particle.userData.rotationSpeed;
                        particle.rotation.x += particle.userData.rotationSpeed * 0.5;
                    }
                });
            }
        }
        // Phase 7: End sequence (13+ seconds)
        else {
            // Clean up
            if (this.victoryMessage) {
                this.scene.remove(this.victoryMessage);
                this.victoryMessage = null;
            }
            if (this.victoryParticles) {
                this.scene.remove(this.victoryParticles);
                this.victoryParticles = null;
            }
            this.isVictorySequence = false;
            
            // Reset UFO visibility
            this.ufo.getMesh().visible = true;

            // Increment level and reset game
            this.updateLevel(this.level + 1);
            this.resetGame();
        }
    }
} 
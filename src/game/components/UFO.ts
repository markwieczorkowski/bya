import * as THREE from 'three';
import { Terrain } from './Terrain';
// Alien by Poly by Google [CC-BY] via Poly Pizza
// @ts-ignore: Ignore missing type declaration for GLTFLoader if not present
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class UFO {
    private mesh: THREE.Group;
    private beamLight: THREE.SpotLight;
    private beamCylinder: THREE.Mesh;
    private beamReticle: THREE.Mesh;
    private isBeamActive: boolean = false;
    private beamHeight: number = 20;
    private beamRadius: number = 2;
    private beamActivationTime: number = 0;
    private isBeamOnCooldown: boolean = false;
    private beamCooldownEndTime: number = 0;
    private readonly BEAM_TIMEOUT: number = 1000;
    private readonly BEAM_COOLDOWN: number = 1000;
    private hasActiveCowInBeam: boolean = false;
    private spacebarWasReleased: boolean = true;
    private statusLights: THREE.Mesh[] = [];
    private lightStreaks: THREE.Group[] = [];
    private readonly NUM_STATUS_LIGHTS = 6;
    private readonly STATUS_LIGHT_COLORS = {
        READY: 0xffff00,
        INACTIVE: 0x444444,
        CYCLE: [
            0xff0000,
            0xff7f00,
            0x00ff00,
            0x0000ff,
            0x4b0082,
            0x9400d3
        ]
    };
    private reticleGroup: THREE.Group;
    private terrain: Terrain;
    private scene: THREE.Scene;
    private alienGroup: THREE.Group | null = null;
    private lastBeamGroundPosition: THREE.Vector3 | null = null;

    constructor(terrain: Terrain, scene: THREE.Scene) {
        console.log('UFO Constructor:', {
            hasScene: !!scene,
            sceneChildren: scene?.children?.length,
            terrain: !!terrain
        });
        
        this.terrain = terrain;
        this.scene = scene;
        this.mesh = new THREE.Group();
        
        // Create UFO body (saucer shape)
        const bodyGeometry = new THREE.SphereGeometry(2, 32, 32);
        bodyGeometry.scale(1, 0.3, 1);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.8,
            roughness: 0.2,
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        
        // Create dome
        const domeGeometry = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMaterial = new THREE.MeshPhongMaterial({
            color: 0x44ff44,
            transparent: true,
            opacity: 0.6,
        });
        const dome = new THREE.Mesh(domeGeometry, domeMaterial);
        dome.position.y = 0.3;

        // Create beam reticle first (before other beam components)
        const reticleGeometry = new THREE.RingGeometry(this.beamRadius - 0.2, this.beamRadius, 32);
        const reticleMaterial = new THREE.MeshBasicMaterial({
            color: 0x220000,  // Changed back to black
            transparent: true,
            opacity: 0.2,     // Much more transparent
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
        this.beamReticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
        this.beamReticle.rotation.x = -Math.PI / 2;
        this.beamReticle.visible = true;  // Start visible for testing
        
        // Create reticle group and add to scene
        this.reticleGroup = new THREE.Group();
        this.reticleGroup.add(this.beamReticle);

        // Create beam light
        this.beamLight = new THREE.SpotLight(0xffff88, 5, 50, Math.PI / 6, 0.5, 2);
        this.beamLight.position.y = -0.5;
        this.beamLight.target.position.y = -10;
        this.beamLight.visible = false;

        // Create beam cylinder
        const beamGeometry = new THREE.CylinderGeometry(this.beamRadius, this.beamRadius, this.beamHeight, 32, 1, true);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff88,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.beamCylinder = new THREE.Mesh(beamGeometry, beamMaterial);
        this.beamCylinder.position.y = -this.beamHeight/2;
        this.beamCylinder.visible = false;

        // Add components to UFO mesh
        this.mesh.add(body, dome, this.beamLight, this.beamLight.target, this.beamCylinder);

        // Set initial position
        this.mesh.position.y = 10;

        // Create status lights
        this.createStatusLights();

        // Add alien pilot inside dome
        this.loadAlienModel(dome);
    }

    // Add method to get reticle group
    getReticleGroup(): THREE.Group {
        return this.reticleGroup;
    }

    getMesh(): THREE.Group {
        return this.mesh;
    }

    getPosition(): THREE.Vector3 {
        return this.mesh.position.clone();
    }

    getRotation(): THREE.Euler {
        return this.mesh.rotation.clone();
    }

    setPosition(x: number, y: number, z: number): void {
        this.mesh.position.set(x, y, z);
        // Update beam target position
        this.beamLight.target.position.set(0, -10, 0);
    }

    rotate(angle: number): void {
        this.mesh.rotation.y += angle;
    }

    updateReticle(): void {
        if (!this.scene) {
            console.error('Scene is undefined in updateReticle!');
            return;
        }

        // Get current altitude
        const altitude = this.mesh.position.y - this.getGroundHeight();
        
        // First determine if we should show the reticle at all
        const isInRange = altitude <= 25;
        const isAvailable = !this.isBeamActive && !this.isOnCooldown();
        const showReticle = isInRange && isAvailable;

        // Debug logging
        console.log('Reticle Debug:', {
            ufoPosition: this.mesh.position.toArray(),
            groundHeight: this.getGroundHeight(),
            altitude,
            isInRange,
            isAvailable,
            showReticle,
            reticleVisible: this.beamReticle.visible,
            reticlePosition: this.beamReticle.position.toArray(),
            reticleParent: this.beamReticle.parent ? 'Has Parent' : 'No Parent',
            reticleWorldPosition: this.beamReticle.getWorldPosition(new THREE.Vector3()).toArray()
        });

        if (!showReticle) {
            this.beamReticle.visible = false;
            return;
        }

        // Update reticle position to follow terrain
        const raycaster = new THREE.Raycaster();
        const rayOrigin = this.mesh.position.clone();
        raycaster.ray.origin.copy(rayOrigin);
        raycaster.ray.direction.set(0, -1, 0);

        // Find terrain intersection - now using scene directly
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        let foundTerrain = false;
        let intersectionPoint: THREE.Vector3 | null = null;

        // Log each intersection separately for clarity
        console.log('=== Raycast Debug Start ===');
        console.log('Ray Origin:', rayOrigin.toArray());
        console.log('Number of intersections:', intersects.length);
        
        intersects.forEach((intersection, index) => {
            console.log(`Intersection ${index + 1}:`, {
                objectType: intersection.object.type,
                name: intersection.object.name || 'unnamed',
                userData: intersection.object.userData,
                parentType: intersection.object.parent?.type,
                parentUserData: intersection.object.parent?.userData,
                isPartOfTerrain: intersection.object.parent === this.terrain.getMesh(),
                distance: intersection.distance,
                point: intersection.point?.toArray()
            });
        });

        // Log terrain details
        const terrainMesh = this.terrain.getMesh();
        console.log('Terrain Mesh:', {
            type: terrainMesh.type,
            userData: terrainMesh.userData,
            name: terrainMesh.name,
            isInScene: this.scene.children.includes(terrainMesh),
            position: terrainMesh.position.toArray(),
            children: terrainMesh.children.length
        });
        console.log('=== Raycast Debug End ===');

        for (const intersection of intersects) {
            const object = intersection.object;
            if (object.userData.type === 'terrain' || 
                (object.parent && object.parent.userData.type === 'terrain') ||
                object.parent === this.terrain.getMesh()) {
                intersectionPoint = intersection.point.clone();
                intersectionPoint.y += 0.5;  // Increased height for testing
                this.beamReticle.position.copy(intersectionPoint);
                this.beamReticle.rotation.set(-Math.PI / 2, 0, 0);
                foundTerrain = true;
                break;
            }
        }
        if (foundTerrain && intersectionPoint) {
            this.beamReticle.visible = true;
            (this.beamReticle.material as THREE.MeshBasicMaterial).opacity = 1.0;
            this.lastBeamGroundPosition = intersectionPoint.clone();
        } else {
            this.beamReticle.visible = false;
            this.lastBeamGroundPosition = null;
        }
    }

    toggleBeam(active: boolean): void {
        const currentTime = Date.now();
        console.log('Toggle Beam:', {
            active,
            currentTime,
            isBeamActive: this.isBeamActive,
            isOnCooldown: this.isBeamOnCooldown,
            cooldownEndTime: this.beamCooldownEndTime,
            spacebarWasReleased: this.spacebarWasReleased,
            timeSinceCooldownEnd: currentTime - this.beamCooldownEndTime
        });

        // If deactivating beam
        if (!active) {
            console.log('Deactivating beam manually');
            this.isBeamActive = false;
            this.beamLight.visible = false;
            this.beamCylinder.visible = false;
            this.hasActiveCowInBeam = false;
            this.spacebarWasReleased = true;  // Mark spacebar as released
            this.updateReticle();  // Update reticle visibility
            return;
        }

        // From here on, we're trying to activate the beam
        
        // If spacebar wasn't released since last deactivation, ignore the activation attempt
        if (!this.spacebarWasReleased) {
            console.log('Ignoring activation - spacebar not released');
            return;
        }

        // Check if beam is on cooldown
        if (this.isBeamOnCooldown) {
            if (currentTime >= this.beamCooldownEndTime) {
                console.log('Cooldown period ended, clearing cooldown state');
                this.isBeamOnCooldown = false;
            } else {
                console.log('Cannot activate - still on cooldown');
                return;
            }
        }

        // Check altitude before activating
        const altitude = this.mesh.position.y - this.getGroundHeight();
        if (altitude > 25) {
            console.log('Cannot activate beam - too high');
            return;
        }

        // Only activate beam if it's not already active
        if (!this.isBeamActive) {
            console.log('Activating beam');
            this.isBeamActive = true;
            this.beamActivationTime = currentTime;
            this.hasActiveCowInBeam = false;
            this.spacebarWasReleased = false;  // Mark spacebar as held
            this.beamLight.visible = true;
            this.beamCylinder.visible = true;
            this.beamReticle.visible = false;  // Hide reticle when beam is active
        }
    }

    // Helper method to get ground height at current position
    private getGroundHeight(): number {
        return this.terrain.getHeightAt(this.mesh.position.x, this.mesh.position.z);
    }

    updateStatusLights(): void {
        const currentTime = Date.now();

        // Double-check cooldown state before updating lights
        if (this.isBeamOnCooldown && currentTime >= this.beamCooldownEndTime) {
            this.isBeamOnCooldown = false;
            this.beamCooldownEndTime = 0;
        }
        
        if (this.isBeamActive) {
            // Cycle colors when beam is active
            const cycleSpeed = 500;
            const cycleOffset = (currentTime % cycleSpeed) / cycleSpeed;
            
            this.statusLights.forEach((light, index) => {
                const colorIndex = Math.floor((index / this.NUM_STATUS_LIGHTS + cycleOffset) * this.STATUS_LIGHT_COLORS.CYCLE.length) % this.STATUS_LIGHT_COLORS.CYCLE.length;
                const color = this.STATUS_LIGHT_COLORS.CYCLE[colorIndex];
                
                // Update light color
                (light.material as THREE.MeshPhongMaterial).color.setHex(color);
                (light.material as THREE.MeshPhongMaterial).emissive.setHex(color);
                (light.material as THREE.MeshPhongMaterial).emissiveIntensity = 1.0;
                
                // Update point light
                const pointLight = light.userData.pointLight as THREE.PointLight;
                pointLight.color.setHex(color);
                pointLight.intensity = 1.5;
                pointLight.distance = 2.0;
                
                // Update streak effects
                const streakGroup = light.userData.streakGroup as THREE.Group;
                streakGroup.visible = true;

                // Apply the soft light effect
                streakGroup.children.forEach((streak: THREE.Object3D, rayIndex: number) => {
                    const rayMaterial = (streak as THREE.Mesh).material as THREE.MeshBasicMaterial;
                    rayMaterial.color.setHex(color);
                    
                    // Gentle opacity pulsing for volumetric effect
                    const pulsePhase = ((currentTime + rayIndex * 200) % 2000) / 2000;
                    const baseOpacity = 0.15;
                    const pulseAmount = 0.05;
                    rayMaterial.opacity = baseOpacity + Math.sin(pulsePhase * Math.PI * 2) * pulseAmount;
                });
            });
        } else {
            // For both cooldown and ready states, hide the streaks
            this.statusLights.forEach(light => {
                const streakGroup = light.userData.streakGroup as THREE.Group;
                streakGroup.visible = false;
                
                const pointLight = light.userData.pointLight as THREE.PointLight;
                pointLight.distance = 1.0;
                
                if (this.isBeamOnCooldown) {
                    // Set all lights to inactive during cooldown
                    (light.material as THREE.MeshPhongMaterial).color.setHex(this.STATUS_LIGHT_COLORS.INACTIVE);
                    (light.material as THREE.MeshPhongMaterial).emissive.setHex(this.STATUS_LIGHT_COLORS.INACTIVE);
                    (light.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.3;
                    pointLight.color.setHex(this.STATUS_LIGHT_COLORS.INACTIVE);
                    pointLight.intensity = 0.3;
                } else {
                    // Set all lights to ready state (yellow)
                    (light.material as THREE.MeshPhongMaterial).color.setHex(this.STATUS_LIGHT_COLORS.READY);
                    (light.material as THREE.MeshPhongMaterial).emissive.setHex(this.STATUS_LIGHT_COLORS.READY);
                    (light.material as THREE.MeshPhongMaterial).emissiveIntensity = 1.0;
                    pointLight.color.setHex(this.STATUS_LIGHT_COLORS.READY);
                    pointLight.intensity = 1.0;
                }
            });
        }
    }

    checkBeamTimeout(): void {
        const currentTime = Date.now();

        // First check if we need to end cooldown
        if (this.isBeamOnCooldown && currentTime >= this.beamCooldownEndTime) {
            console.log('Cooldown period ended in checkBeamTimeout');
            this.isBeamOnCooldown = false;
            this.beamCooldownEndTime = 0;
        }

        // Then check beam timeout
        if (this.isBeamActive && !this.hasActiveCowInBeam) {
            if (currentTime - this.beamActivationTime >= this.BEAM_TIMEOUT) {
                console.log('Beam timeout reached, activating cooldown');
                // Force deactivate beam and start cooldown
                this.isBeamActive = false;
                this.isBeamOnCooldown = true;
                this.beamCooldownEndTime = currentTime + this.BEAM_COOLDOWN;
                this.beamLight.visible = false;
                this.beamCylinder.visible = false;
            }
        }

        // Always update status lights
        this.updateStatusLights();
    }

    resetBeamCooldown(): void {
        console.log('Resetting beam cooldown - cow caught');
        // Call this when successfully catching a cow
        this.isBeamOnCooldown = false;
        this.beamCooldownEndTime = 0;
        this.hasActiveCowInBeam = true;  // Mark that we have an active cow
    }

    startCooldownAfterCapture(): void {
        console.log('Starting cooldown after successful capture');
        // Deactivate beam and start cooldown
        this.isBeamActive = false;
        this.isBeamOnCooldown = true;
        this.beamCooldownEndTime = Date.now() + this.BEAM_COOLDOWN;
        this.beamLight.visible = false;
        this.beamCylinder.visible = false;
        this.hasActiveCowInBeam = false;
        this.spacebarWasReleased = true;  // Allow reactivation after cooldown
    }

    getBeamActive(): boolean {
        return this.isBeamActive;
    }

    getBeamRadius(): number {
        return this.beamRadius;
    }

    isOnCooldown(): boolean {
        const currentTime = Date.now();
        const isStillOnCooldown = this.isBeamOnCooldown && currentTime < this.beamCooldownEndTime;
        
        // If cooldown just ended, update the state
        if (this.isBeamOnCooldown && !isStillOnCooldown) {
            console.log('Cooldown period has ended in isOnCooldown check');
            this.isBeamOnCooldown = false;
            this.beamCooldownEndTime = 0;
            // Force an update of the status lights when cooldown ends
            this.updateStatusLights();
        }
        
        return isStillOnCooldown;
    }

    private createStatusLights(): void {
        // Create status lights around the rim
        const lightGeometry = new THREE.SphereGeometry(0.15, 16, 16);
        const lightMaterial = new THREE.MeshPhongMaterial({
            color: this.STATUS_LIGHT_COLORS.READY,
            emissive: this.STATUS_LIGHT_COLORS.READY,
            emissiveIntensity: 1.0,
            shininess: 100
        });

        // Create streak geometry (wide, soft light rays)
        const streakGeometry = new THREE.PlaneGeometry(0.4, 1.2);
        const streakMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
            map: this.createGradientTexture()
        });

        for (let i = 0; i < this.NUM_STATUS_LIGHTS; i++) {
            const angle = (i / this.NUM_STATUS_LIGHTS) * Math.PI * 2;
            const light = new THREE.Mesh(lightGeometry, lightMaterial.clone());
            const radius = 1.9;
            light.position.set(
                Math.cos(angle) * radius,
                0.15,
                Math.sin(angle) * radius
            );
            
            // Add point light with wider range
            const pointLight = new THREE.PointLight(this.STATUS_LIGHT_COLORS.READY, 0.5, 2);
            pointLight.position.copy(light.position);
            this.mesh.add(pointLight);
            
            // Create soft light rays (6 overlapping rays per light for volume effect)
            const streakGroup = new THREE.Group();
            for (let j = 0; j < 6; j++) {
                const streak = new THREE.Mesh(streakGeometry, streakMaterial.clone());
                streak.position.copy(light.position);
                const rayAngle = (j / 6) * Math.PI * 2;
                streak.rotation.z = rayAngle;
                
                // Slightly offset each ray for volumetric effect
                streak.position.x += Math.cos(rayAngle) * 0.05;
                streak.position.z += Math.sin(rayAngle) * 0.05;
                streakGroup.add(streak);
            }
            streakGroup.visible = false;
            this.lightStreaks.push(streakGroup);
            this.mesh.add(streakGroup);
            
            // Store references
            this.statusLights.push(light);
            light.userData.pointLight = pointLight;
            light.userData.streakGroup = streakGroup;
            this.mesh.add(light);
        }
    }

    private createGradientTexture(): THREE.Texture | null {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Create radial gradient
        const gradient = ctx.createRadialGradient(
            32, 32, 0,    // Inner circle center and radius
            32, 32, 32    // Outer circle center and radius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        // Fill with gradient
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    private loadAlienModel(dome: THREE.Mesh): void {
        const loader = new GLTFLoader();
        loader.load(
            './models/Alien.glb',
            (gltf: any) => {
                const alien = gltf.scene;
                // Scale down further for proper fit
                alien.scale.set(0.10, 0.09, 0.10); // Adjust as needed
                // Center horizontally, lower vertically so only upper body is visible
                alien.position.set(0, -0.45, 0); // Adjust Y for fit inside dome
                // Optionally rotate to face forward
                // alien.rotation.y = Math.PI;
                // Add as child of dome
                this.alienGroup = new THREE.Group();
                this.alienGroup.add(alien);
                dome.add(this.alienGroup);
            },
            undefined,
            (error: ErrorEvent) => {
                console.error('Error loading Alien.glb:', error);
            }
        );
    }

    // Returns the last known beam ground position, or null if not available
    getBeamGroundPosition(): THREE.Vector3 | null {
        return this.lastBeamGroundPosition ? this.lastBeamGroundPosition.clone() : null;
    }
} 